"""MyFitnessPal nutrition, over plain HTTP with no browser.

How this works, and why it is not the obvious thing:

MyFitnessPal's *login* form is protected by a Cloudflare Turnstile bot check
that fails for any automated browser regardless of who types the password.
Defeating a bot check is not something this project does, so signing in was a
dead end.

Logging in turns out to be unnecessary. MyFitnessPal has a first-class feature
for letting someone else read your diary: Settings > Diary Settings > Diary
Sharing, set to "Locked with a Key". That is exactly what this uses. The key is
a sharing key, not an account credential, and it grants read access to the
diary and nothing else.

The printable-diary page renders its table client-side, so scraping the HTML
returns an empty shell. The page gets its data from a JSON endpoint, and that
endpoint is what this calls directly. The result is structured data rather than
parsed markup: exact figures, no layout assumptions, and one request covers a
whole date range.

Per-entry nutrition is read from the entry's own `nutritional_contents`, not the
food's. The food's figures are per serving unit; the entry's are what was
actually eaten. Half a jar of sauce is 45 kcal at the entry level and 90 at the
food level, and only one of those is what you consumed.
"""

from __future__ import annotations

import http.cookiejar
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Any

log = logging.getLogger(__name__)

BASE = "https://www.myfitnesspal.com"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)

# MyFitnessPal's field names on the left, this project's column names on the right.
_NUTRIENTS = {
    "protein": "protein",
    "carbohydrates": "carbs",
    "fat": "fat",
    "fiber": "fiber",
    "sugar": "sugar",
    "sodium": "sodium",
}


class MfpHttpError(RuntimeError):
    pass


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n else None


def summarise_day(day: dict[str, Any]) -> dict[str, float] | None:
    """Total one day's food entries.

    Returns None for a day with no entries, so an unlogged day is recorded as
    unknown rather than as a genuine zero-calorie day. The difference matters:
    the mission only counts days where intake is actually known.
    """
    entries = day.get("food_entries") or []
    if not entries:
        return None

    totals: dict[str, float] = {"calories": 0.0}
    seen_calories = False

    for entry in entries:
        contents = entry.get("nutritional_contents") or {}

        energy = contents.get("energy") or {}
        kcal = _num(energy.get("value"))
        if kcal is not None:
            # Guard against a locale returning kilojoules.
            if str(energy.get("unit", "")).lower().startswith("kilojoule"):
                kcal = kcal / 4.184
            totals["calories"] += kcal
            seen_calories = True

        for source, target in _NUTRIENTS.items():
            value = _num(contents.get(source))
            if value is not None:
                totals[target] = totals.get(target, 0.0) + value

    return totals if seen_calories else None


class MfpHttpAdapter:
    """Reads the shared diary. No browser, no login, no bot check."""

    def __init__(self, username: str, key: str | None = None, timeout: int = 30) -> None:
        if not username:
            raise MfpHttpError("A MyFitnessPal username is required.")
        self.username = username.strip().lstrip("@")
        self.key = key or None
        self.timeout = timeout

        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._jar)
        )
        self._opener.addheaders = [
            ("User-Agent", USER_AGENT),
            ("Accept", "application/json, text/html"),
            ("Accept-Language", "en-US,en;q=0.9"),
        ]

    def diary_url(self, start: date, end: date) -> str:
        return (
            f"{BASE}/reports/printable-diary/{urllib.parse.quote(self.username)}"
            f"?from={start.isoformat()}&to={end.isoformat()}"
        )

    def fetch_range(self, start: date, end: date) -> list[dict[str, Any]]:
        """Fetch every day between two dates in a single request."""
        if not self.key:
            raise MfpHttpError(
                "No diary key configured. Set MFP_DIARY_KEY in sync/.env to the key "
                "from MyFitnessPal under Settings > Diary Settings > Diary Sharing."
            )

        endpoint = (
            f"{BASE}/api/services/authenticate_diary_key"
            f"?username={urllib.parse.quote(self.username)}"
        )
        payload = {
            "key": self.key,
            "username": self.username,
            "from": start.isoformat(),
            "to": end.isoformat(),
            "show_food_diary": 1,
            "show_food_notes": 0,
            "show_exercise_diary": 0,
            "show_exercise_notes": 0,
        }

        request = urllib.request.Request(
            endpoint, data=json.dumps(payload).encode(), method="POST"
        )
        request.add_header("Content-Type", "application/json")
        request.add_header("Referer", self.diary_url(start, end))
        request.add_header("Origin", BASE)

        try:
            with self._opener.open(request, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:200]
            if exc.code in (401, 403):
                raise MfpHttpError(
                    "MyFitnessPal rejected the diary key. Check MFP_DIARY_KEY against "
                    "Settings > Diary Settings > Diary Sharing, exactly as typed there."
                ) from exc
            if exc.code == 404:
                raise MfpHttpError(
                    f"MyFitnessPal does not recognise the username '{self.username}'. "
                    "MFP_USERNAME is the last part of your profile URL."
                ) from exc
            raise MfpHttpError(f"Diary request returned {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise MfpHttpError(f"Could not reach MyFitnessPal: {exc.reason}") from exc

        lowered = raw[:400].lower()
        if "not correct" in lowered or "incorrect" in lowered:
            raise MfpHttpError(
                "MyFitnessPal says the diary key is not correct. Check MFP_DIARY_KEY, "
                "including capitalisation."
            )

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise MfpHttpError(
                f"MyFitnessPal returned something that is not JSON: {raw[:160]}"
            ) from exc

        if not isinstance(data, list):
            raise MfpHttpError(f"Unexpected diary payload shape: {type(data).__name__}")
        return data

    def nutrition_range(self, start: date, end: date) -> list[dict[str, Any]]:
        """Rows ready to upsert, one per day that actually has entries."""
        rows: list[dict[str, Any]] = []
        for day in self.fetch_range(start, end):
            iso = str(day.get("date", ""))[:10]
            if not iso:
                continue
            totals = summarise_day(day)
            if not totals:
                continue
            rows.append(
                {
                    "date": iso,
                    "raw_mfp_calories": round(totals["calories"], 1),
                    "protein": round(totals["protein"], 1) if "protein" in totals else None,
                    "carbs": round(totals["carbs"], 1) if "carbs" in totals else None,
                    "fat": round(totals["fat"], 1) if "fat" in totals else None,
                    "fiber": round(totals["fiber"], 1) if "fiber" in totals else None,
                    "sugar": round(totals["sugar"], 1) if "sugar" in totals else None,
                    "sodium": round(totals["sodium"], 1) if "sodium" in totals else None,
                    "nutrition_source": "mfp",
                }
            )
        return rows

    def nutrition_for(self, day: date) -> dict[str, Any] | None:
        rows = self.nutrition_range(day, day)
        return rows[0] if rows else None

    def check_access(self) -> tuple[bool, str]:
        """Probe the diary and describe what came back."""
        if not self.key:
            return False, "MFP_DIARY_KEY is not set"

        today = date.today()
        try:
            days = self.fetch_range(today - timedelta(days=6), today)
        except MfpHttpError as exc:
            return False, str(exc)

        logged = sum(1 for d in days if summarise_day(d))
        return True, f"key accepted, {logged} of the last 7 days have entries"
