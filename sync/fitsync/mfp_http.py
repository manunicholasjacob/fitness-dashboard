"""MyFitnessPal via the printable diary, over plain HTTP.

This replaces the browser entirely.

MyFitnessPal's *login* form is protected by a Cloudflare Turnstile bot check
that fails for any automated browser regardless of who types the password, and
defeating a bot check is not something this project does. But logging in turns
out to be unnecessary: the printable diary is gated by MyFitnessPal's own
**diary sharing** setting, not by authentication. Set the diary to "Public" or
"Locked with a Key" and the page is served to a plain HTTP GET, with no
session, no cookies from a browser profile, and no challenge.

That makes this both simpler and far more durable than driving Chrome: nothing
to expire, nothing to re-authenticate, no browser to install, and it runs
anywhere.

The trade is a deliberate privacy decision the account owner makes: "Locked
with a Key" keeps the diary unreadable without the key, which is why it is the
recommended setting rather than "Public".
"""

from __future__ import annotations

import http.cookiejar
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from html.parser import HTMLParser
from typing import Any

log = logging.getLogger(__name__)

BASE = "https://www.myfitnesspal.com"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)


class MfpHttpError(RuntimeError):
    pass


# --- HTML table extraction ---------------------------------------------------

_COLUMN_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^calories?$", re.I), "calories"),
    (re.compile(r"^(carbs?|carbohydrates?)", re.I), "carbs"),
    (re.compile(r"^fat", re.I), "fat"),
    (re.compile(r"^protein", re.I), "protein"),
    (re.compile(r"^(fibre|fiber)", re.I), "fiber"),
    (re.compile(r"^sugars?", re.I), "sugar"),
    (re.compile(r"^sodium", re.I), "sodium"),
]


def _classify(header: str) -> str | None:
    h = header.strip()
    for pattern, key in _COLUMN_PATTERNS:
        if pattern.match(h):
            return key
    return None


def _number(raw: str) -> float | None:
    cleaned = re.sub(r"[^0-9.\-]", "", raw)
    if cleaned in ("", "-", "."):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


class _TableParser(HTMLParser):
    """Collects every table as a list of rows of cell text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def extract_totals(html: str) -> dict[str, float] | None:
    """Pull the day's totals out of a printable-diary page.

    Mirrors the browser extractor exactly: find the table with a Calories
    header, then take the LAST totals-style row in it, because earlier ones are
    per-meal subtotals and a "Goal" row can follow the real total.
    """
    parser = _TableParser()
    parser.feed(html)

    for table in reversed(parser.tables):
        if len(table) < 2:
            continue

        headers: list[str] | None = None
        for row in table:
            if any(re.match(r"^calories?$", c.strip(), re.I) for c in row):
                headers = row
                break
        if not headers:
            continue

        totals: list[str] | None = None
        for row in table:
            if row and re.match(r"^total", row[0].strip(), re.I):
                totals = row
        if not totals:
            continue

        out: dict[str, float] = {}
        for i, header in enumerate(headers):
            key = _classify(header)
            if key and i < len(totals):
                value = _number(totals[i])
                if value is not None:
                    out[key] = value
        if out.get("calories") is not None:
            return out
    return None


# --- diary fetching ----------------------------------------------------------

_PRIVATE_MARKERS = (
    "maintains a private diary",
    "private diary",
    "diary is private",
)


class MfpHttpAdapter:
    """Reads the printable diary with no browser and no login."""

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
            ("Accept", "text/html,application/xhtml+xml"),
            ("Accept-Language", "en-US,en;q=0.9"),
        ]
        self._unlocked = False

    def _get(self, url: str) -> str:
        try:
            with self._opener.open(url, timeout=self.timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            raise MfpHttpError(f"GET {url} returned {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise MfpHttpError(f"Could not reach MyFitnessPal: {exc.reason}") from exc

    def diary_url(self, day: date) -> str:
        iso = day.isoformat()
        return f"{BASE}/reports/printable-diary/{urllib.parse.quote(self.username)}?from={iso}&to={iso}"

    def _submit_key(self, html: str, url: str) -> str:
        """Answer a 'locked with a key' prompt, if one is shown."""
        if not self.key:
            raise MfpHttpError(
                "This diary is locked with a key and no key is configured. "
                "Set MFP_DIARY_KEY in sync/.env to the key you chose in "
                "MyFitnessPal under Settings > Diary Settings > Diary Sharing."
            )

        # The prompt is a small form; find its action and the key field name.
        action_match = re.search(r'<form[^>]+action="([^"]+)"', html, re.I)
        field_match = re.search(
            r'<input[^>]+name="([^"]*(?:key|password)[^"]*)"', html, re.I
        )
        action = urllib.parse.urljoin(url, action_match.group(1)) if action_match else url
        field = field_match.group(1) if field_match else "key"

        data = urllib.parse.urlencode({field: self.key}).encode()
        request = urllib.request.Request(action, data=data, method="POST")
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
        request.add_header("Referer", url)
        try:
            with self._opener.open(request, timeout=self.timeout) as resp:
                resp.read()
        except urllib.error.HTTPError as exc:
            raise MfpHttpError(f"Submitting the diary key returned {exc.code}") from exc

        self._unlocked = True
        return self._get(url)

    def nutrition_for(self, day: date) -> dict[str, Any] | None:
        url = self.diary_url(day)
        html = self._get(url)

        lowered = html.lower()
        needs_key = "locked with a key" in lowered or (
            "name=\"key\"" in lowered and "diary" in lowered
        )
        if needs_key and not self._unlocked:
            html = self._submit_key(html, url)
            lowered = html.lower()

        if any(marker in lowered for marker in _PRIVATE_MARKERS):
            raise MfpHttpError(
                f"MyFitnessPal reports that {self.username}'s diary is private. "
                "In MyFitnessPal go to Settings > Diary Settings > Diary Sharing and "
                "choose 'Locked with a Key' (recommended) or 'Public', then put the key "
                "in MFP_DIARY_KEY. Nothing else about your account changes."
            )

        totals = extract_totals(html)
        if not totals or not totals.get("calories"):
            log.info("No diary entries for %s", day.isoformat())
            return None

        return {
            "date": day.isoformat(),
            "raw_mfp_calories": totals.get("calories"),
            "protein": totals.get("protein"),
            "carbs": totals.get("carbs"),
            "fat": totals.get("fat"),
            "fiber": totals.get("fiber"),
            "sugar": totals.get("sugar"),
            "sodium": totals.get("sodium"),
            "nutrition_source": "mfp",
        }

    def check_access(self) -> tuple[bool, str]:
        """Probe the diary and describe what came back."""
        try:
            html = self._get(self.diary_url(date.today()))
        except MfpHttpError as exc:
            return False, str(exc)

        lowered = html.lower()
        if "locked with a key" in lowered:
            return (
                (True, "diary is key-locked and a key is configured")
                if self.key
                else (False, "diary is key-locked but MFP_DIARY_KEY is not set")
            )
        if any(m in lowered for m in _PRIVATE_MARKERS):
            return False, "diary sharing is set to Private"
        if "printable diary" in lowered:
            return True, "diary is readable"
        return False, "unexpected response from MyFitnessPal"
