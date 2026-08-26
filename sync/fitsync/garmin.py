"""Garmin Connect adapter.

Garmin's official Connect Developer Program requires a legal entity and rejects
personal-use applications, and it is currently suspended for new applicants, so
there is no OAuth route available to an individual. This adapter uses the
`garminconnect` library, which performs the same mobile SSO login the official
Garmin app does and caches the resulting tokens locally.

Everything is read defensively: Garmin reshapes these private endpoints without
notice, so a missing field yields None rather than an exception, and a partial
day is still worth storing.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from .config import GARMIN_TOKEN_DIR

log = logging.getLogger(__name__)


class GarminError(RuntimeError):
    pass


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n else None  # filter NaN


def _int(value: Any) -> int | None:
    """Coerce to int for columns Postgres declares as integer.

    Garmin returns step counts as floats. Postgres rejects "4443.0" for an
    integer column outright, so the rounding has to happen here rather than
    being left to the database.
    """
    n = _num(value)
    return None if n is None else int(round(n))


def _timestamp(value: Any) -> str | None:
    """Normalise a Garmin GMT timestamp string to ISO 8601 with a zone."""
    if not value:
        return None
    text = str(value).strip().replace(" ", "T")
    if not text:
        return None
    return text if text.endswith("Z") or "+" in text[10:] else text + "Z"


def _first(payload: dict[str, Any] | None, *keys: str) -> Any:
    """Return the first present, non-null key. Garmin renames fields often."""
    if not payload:
        return None
    for key in keys:
        if payload.get(key) is not None:
            return payload[key]
    return None


ACTIVITY_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("run", "tread", "track"), "running"),
    (("walk",), "walking"),
    (("cycl", "bik", "spin"), "cycling"),
    (("swim",), "swimming"),
    (("strength", "weight", "resistance", "gym"), "strength"),
    (("climb", "boulder"), "climbing"),
    (("hik",), "hiking"),
    (("cardio", "elliptical", "row", "hiit"), "cardio"),
]


def normalize_activity_type(raw: str | None) -> str:
    if not raw:
        return "other"
    lowered = raw.lower()
    for keywords, mapped in ACTIVITY_KEYWORDS:
        if any(k in lowered for k in keywords):
            return mapped
    return "other"


class GarminAdapter:
    def __init__(self, email: str, password: str, timezone: str) -> None:
        self._email = email
        self._password = password
        self._tz = ZoneInfo(timezone)
        self._client: Any = None

    # --- connection ---------------------------------------------------------

    def connect(self) -> None:
        try:
            from garminconnect import Garmin
        except ImportError as exc:
            raise GarminError(
                "garminconnect is not installed. Run: pip install -r sync/requirements.txt"
            ) from exc

        GARMIN_TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        client = Garmin(self._email, self._password)

        # Resume from cached tokens when possible; a full login every day is
        # both slow and a good way to attract Garmin's rate limiting.
        try:
            client.login(str(GARMIN_TOKEN_DIR))
        except Exception as exc:  # noqa: BLE001 - library raises many shapes
            log.info("Cached Garmin token unusable (%s), logging in fresh.", exc)
            try:
                client.login()
                if hasattr(client, "garth") and hasattr(client.garth, "dump"):
                    client.garth.dump(str(GARMIN_TOKEN_DIR))
            except Exception as inner:  # noqa: BLE001
                raise GarminError(
                    f"Garmin login failed: {inner}. If your account has multi-factor "
                    "authentication enabled, run the agent once interactively with HEADLESS=0."
                ) from inner

        self._client = client

    def _require(self) -> Any:
        if self._client is None:
            raise GarminError("Not connected. Call connect() first.")
        return self._client

    def _safe(self, method: str, *args: Any) -> Any:
        """Call an endpoint, returning None if it is unavailable or errors."""
        client = self._require()
        fn = getattr(client, method, None)
        if fn is None:
            log.debug("garminconnect has no method %s", method)
            return None
        try:
            return fn(*args)
        except Exception as exc:  # noqa: BLE001
            log.warning("Garmin %s failed: %s", method, exc)
            return None

    # --- daily metrics ------------------------------------------------------

    def steps_before(self, day: date, deadline: time) -> int | None:
        """Sum intraday step buckets that end at or before the deadline.

        Garmin reports these buckets in UTC, so each one is converted into the
        configured local timezone before being compared against the deadline.
        """
        data = self._safe("get_steps_data", day.isoformat())
        if not isinstance(data, list) or not data:
            return None

        cutoff = datetime.combine(day, deadline, tzinfo=self._tz)
        total = 0
        counted = 0

        for bucket in data:
            stamp = _first(bucket, "endGMT", "startGMT")
            steps = _num(_first(bucket, "steps", "stepsCount"))
            if stamp is None or steps is None:
                continue
            try:
                parsed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
            except ValueError:
                continue
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
            if parsed.astimezone(self._tz) <= cutoff:
                total += int(steps)
                counted += 1

        # No buckets at all before the deadline is a real zero only if the day
        # produced buckets afterwards; otherwise the watch simply had no data.
        return total if counted or data else None

    def daily_metrics(self, day: date, deadline: time) -> dict[str, Any]:
        stats = self._safe("get_stats", day.isoformat()) or {}
        sleep = self._safe("get_sleep_data", day.isoformat()) or {}
        sleep_dto = sleep.get("dailySleepDTO", {}) if isinstance(sleep, dict) else {}
        scores = sleep_dto.get("sleepScores", {}) if isinstance(sleep_dto, dict) else {}

        moderate = _num(stats.get("moderateIntensityMinutes")) or 0
        vigorous = _num(stats.get("vigorousIntensityMinutes")) or 0
        intensity = (moderate + vigorous) or None

        row: dict[str, Any] = {
            "date": day.isoformat(),
            "raw_garmin_total_calories": _num(
                _first(stats, "totalKilocalories", "totalCalories")
            ),
            "raw_garmin_active_calories": _num(
                _first(stats, "activeKilocalories", "activeCalories")
            ),
            "raw_garmin_resting_calories": _num(
                _first(stats, "bmrKilocalories", "restingCalories")
            ),
            "steps_total": _int(_first(stats, "totalSteps", "steps")),
            "steps_before_deadline": self.steps_before(day, deadline),
            "distance_meters": _num(_first(stats, "totalDistanceMeters", "distance")),
            "active_minutes": _num(
                _first(stats, "activeSeconds", "highlyActiveSeconds")
            ),
            "intensity_minutes": intensity,
            "floors_climbed": _num(_first(stats, "floorsAscended")),
            "average_hr": _num(_first(stats, "averageHeartRate", "avgHeartRate")),
            "resting_hr": _num(_first(stats, "restingHeartRate")),
            "max_hr": _num(_first(stats, "maxHeartRate")),
            "sleep_seconds": _num(_first(sleep_dto, "sleepTimeSeconds")),
            "sleep_deep_seconds": _num(_first(sleep_dto, "deepSleepSeconds")),
            "sleep_rem_seconds": _num(_first(sleep_dto, "remSleepSeconds")),
            "sleep_score": _num(
                (scores.get("overall") or {}).get("value") if isinstance(scores, dict) else None
            ),
            "stress_avg": _num(_first(stats, "averageStressLevel")),
            "body_battery_high": _num(_first(stats, "bodyBatteryHighestValue")),
            "body_battery_low": _num(_first(stats, "bodyBatteryLowestValue")),
            "spo2_avg": _num(_first(stats, "averageSpo2", "avgSpo2")),
            "respiration_avg": _num(_first(stats, "avgWakingRespirationValue")),
            # How current this actually is. Garmin only holds what the watch
            # has uploaded, so the figures can lag the phone app by hours.
            "garmin_data_through": _timestamp(
                _first(stats, "wellnessEndTimeGmt", "lastSyncTimestampGMT")
            ),
            "energy_source": "garmin",
        }

        # Garmin reports "active seconds"; the app stores minutes.
        if row["active_minutes"] is not None:
            row["active_minutes"] = round(row["active_minutes"] / 60, 1)

        # Never send a row of nothing but a date: it would create an empty
        # record that makes the day look synced when it is not.
        meaningful = any(
            v is not None for k, v in row.items() if k not in {"date", "energy_source"}
        )
        return row if meaningful else {}

    # --- activities ---------------------------------------------------------

    def activities(self, start: date, end: date) -> list[dict[str, Any]]:
        raw = self._safe("get_activities_by_date", start.isoformat(), end.isoformat())
        if not isinstance(raw, list):
            return []

        out: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            activity_id = item.get("activityId")
            start_time = _first(item, "startTimeLocal", "startTimeGMT")
            if activity_id is None or start_time is None:
                continue

            type_key = ((item.get("activityType") or {}).get("typeKey")) if isinstance(
                item.get("activityType"), dict
            ) else None

            duration = _num(_first(item, "duration", "elapsedDuration", "movingDuration")) or 0
            distance = _num(item.get("distance"))
            speed = _num(_first(item, "averageSpeed", "avgSpeed"))
            if speed is None and distance and duration:
                speed = distance / duration

            out.append(
                {
                    "external_source": "garmin",
                    "external_id": str(activity_id),
                    "activity_type": normalize_activity_type(type_key or item.get("activityName")),
                    "raw_activity_type": type_key,
                    # Garmin's "local" timestamps carry no offset; treat them as
                    # local wall-clock so the date buckets line up with the app.
                    "start_time": str(start_time).replace(" ", "T"),
                    "duration_seconds": duration,
                    "distance_meters": distance,
                    "calories": _num(_first(item, "calories", "activeKilocalories")),
                    "average_hr": _num(_first(item, "averageHR", "avgHr")),
                    "max_hr": _num(_first(item, "maxHR", "maxHr")),
                    "average_speed_mps": speed,
                    "cadence": _num(
                        _first(item, "averageRunningCadenceInStepsPerMinute", "averageBikingCadenceInRevPerMinute")
                    ),
                    "running_power": _num(_first(item, "avgPower", "averagePower")),
                    "elevation_gain_meters": _num(item.get("elevationGain")),
                    "training_load": _num(_first(item, "activityTrainingLoad")),
                    "aerobic_training_effect": _num(item.get("aerobicTrainingEffect")),
                }
            )
        return out


def date_range(days: int, today: date | None = None) -> Iterable[date]:
    """The last `days` dates, oldest first, ending today."""
    end = today or date.today()
    for offset in range(days - 1, -1, -1):
        yield end - timedelta(days=offset)
