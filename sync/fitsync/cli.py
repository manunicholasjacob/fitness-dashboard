"""Sync agent entry point.

    python run_sync.py all       both providers
    python run_sync.py garmin    Garmin only
    python run_sync.py mfp       MyFitnessPal only
    python run_sync.py login     one-time MyFitnessPal browser sign-in
    python run_sync.py doctor    diagnose the whole setup and say what to fix
    python run_sync.py status    recent sync history

Every provider run is independent: Garmin failing must not stop MyFitnessPal,
because a half-synced day is far more useful than no day at all.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date, datetime, time, timedelta

from .config import BROWSER_PROFILE, ConfigError, load_config
from .doctor import run_doctor
from .garmin import GarminAdapter, GarminError, date_range
from .mfp import MfpAdapter, MfpError
from .mfp_http import MfpHttpAdapter, MfpHttpError
from .store import Store, StoreError

log = logging.getLogger("fitsync")


def _parse_deadline(raw: str | None) -> time:
    """Settings store 'HH:MM:SS'; fall back to 09:00 on anything unexpected."""
    if not raw:
        return time(9, 0)
    parts = str(raw).split(":")
    try:
        return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return time(9, 0)


# --- Garmin ------------------------------------------------------------------


def sync_garmin(store: Store, config, days: int) -> int:
    if not config.garmin_email or not config.garmin_password:
        log.warning("GARMIN_EMAIL / GARMIN_PASSWORD not set, skipping Garmin.")
        return 0

    settings = store.get_settings()
    deadline = _parse_deadline(settings.get("morning_deadline"))
    timezone = settings.get("timezone") or config.timezone

    log_id = store.start_sync("garmin")
    try:
        adapter = GarminAdapter(config.garmin_email, config.garmin_password, timezone)
        adapter.connect()

        rows = []
        for day in date_range(days):
            row = adapter.daily_metrics(day, deadline)
            if row:
                rows.append(row)
                log.info(
                    "Garmin %s: %s kcal, %s steps (%s before %s)",
                    day,
                    row.get("raw_garmin_total_calories"),
                    row.get("steps_total"),
                    row.get("steps_before_deadline"),
                    deadline.strftime("%H:%M"),
                )

        written = store.upsert_daily(rows)

        start = date.today() - timedelta(days=days - 1)
        found = adapter.activities(start, date.today())
        # Skip activities already stored so the log count reflects real work.
        known = store.existing_activity_ids()
        fresh = [a for a in found if a["external_id"] not in known]
        written += store.upsert_activities(fresh)
        log.info("Garmin activities: %d found, %d new", len(found), len(fresh))

        store.finish_sync(log_id, status="success", records=written)
        return written

    except (GarminError, StoreError) as exc:
        log.error("Garmin sync failed: %s", exc)
        store.finish_sync(log_id, status="failed", error=str(exc))
        return 0
    except Exception as exc:  # noqa: BLE001
        log.exception("Garmin sync crashed")
        store.finish_sync(log_id, status="failed", error=repr(exc))
        return 0


# --- MyFitnessPal ------------------------------------------------------------


def sync_mfp(store: Store, config, days: int) -> int:
    """Pull nutrition from the printable diary over plain HTTP.

    No browser and no login: the printable diary is gated by MyFitnessPal's own
    diary-sharing setting, so a shared diary is readable with a GET. The login
    form sits behind a Cloudflare bot check that cannot be automated, and is
    deliberately not involved.
    """
    if not config.mfp_username:
        log.info(
            "MFP_USERNAME not set, skipping MyFitnessPal. Calories are entered on the dashboard."
        )
        return 0

    log_id = store.start_sync("mfp")
    try:
        adapter = MfpHttpAdapter(config.mfp_username, config.mfp_diary_key)

        readable, detail = adapter.check_access()
        if not readable:
            raise MfpHttpError(detail)
        log.info("MyFitnessPal: %s", detail)

        rows = []
        empty = 0
        for day in date_range(days):
            row = adapter.nutrition_for(day)
            if row:
                rows.append(row)
                log.info("MyFitnessPal %s: %s kcal", day, row.get("raw_mfp_calories"))
            else:
                empty += 1

        written = store.upsert_daily(rows)

        # An empty diary is legitimate; an entirely empty window usually is not.
        status = "success" if rows else "partial"
        store.finish_sync(
            log_id,
            status=status,
            records=written,
            error=None if rows else f"No diary entries found across {empty} days.",
        )
        return written

    except (MfpHttpError, StoreError) as exc:
        log.error("MyFitnessPal sync failed: %s", exc)
        store.finish_sync(log_id, status="failed", error=str(exc))
        return 0
    except Exception as exc:  # noqa: BLE001
        log.exception("MyFitnessPal sync crashed")
        store.finish_sync(log_id, status="failed", error=repr(exc))
        return 0


# --- commands ----------------------------------------------------------------


def cmd_login(config) -> int:
    print("Opening a browser so you can sign in to MyFitnessPal once.")
    print(f"The session will be saved to: {BROWSER_PROFILE}\n")
    with MfpAdapter(None, headless=False) as mfp:
        if mfp.interactive_login(timeout_seconds=720, prefill_email=config.mfp_email):
            username = mfp.detect_username()
            print("\nSigned in successfully.")
            if username:
                print(f"Detected username: {username}")
                print("Add this to sync/.env to skip detection on future runs:")
                print(f"  MFP_USERNAME={username}")
            return 0
        print("\nStill on the login page. Nothing was saved. Try again.")
        return 1


def cmd_status(store: Store) -> int:
    rows = store.recent_syncs(15)
    if not rows:
        print("No sync runs recorded yet.")
        return 0

    print(f"{'started':<22} {'provider':<10} {'status':<9} {'records':>7}  error")
    print("-" * 78)
    for r in rows:
        started = str(r.get("started_at", ""))[:19].replace("T", " ")
        error = (r.get("error_message") or "")[:30]
        print(
            f"{started:<22} {r.get('provider',''):<10} {r.get('status',''):<9} "
            f"{r.get('records_imported', 0):>7}  {error}"
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="run_sync", description="Fitness dashboard sync agent")
    parser.add_argument(
        "command",
        choices=["all", "garmin", "mfp", "login", "doctor", "status"],
        nargs="?",
        default="all",
    )
    parser.add_argument("--days", type=int, default=None, help="How many days back to sync")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )

    try:
        # The doctor exists to report missing configuration, so it must be able
        # to load a partial config rather than refusing to start.
        config = load_config(strict=args.command != "doctor")
    except ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        print("Run 'npm run sync:doctor' for a full checklist.", file=sys.stderr)
        return 2

    if args.command == "login":
        return cmd_login(config)

    # doctor runs before the Supabase sign-in below, because diagnosing a
    # broken sign-in is exactly one of the things it is for.
    if args.command == "doctor":
        return run_doctor(config)

    days = args.days or config.backfill_days

    store = Store(config)
    try:
        store.sign_in()
    except StoreError as exc:
        print(f"Could not sign in to Supabase: {exc}", file=sys.stderr)
        return 2

    if args.command == "status":
        return cmd_status(store)

    started = datetime.now()
    total = 0
    failures: list[str] = []
    if args.command in ("all", "garmin"):
        written = sync_garmin(store, config, days)
        total += written
        if config.garmin_email and written == 0:
            failures.append("garmin")
    if args.command in ("all", "mfp"):
        total += sync_mfp(store, config, days)

    elapsed = (datetime.now() - started).total_seconds()
    log.info("Wrote %d records in %.1fs", total, elapsed)
    # Non-zero exit lets Task Scheduler surface a genuinely failed run. Writing
    # nothing is normal when the day's data has not changed, so failure is
    # judged on whether a provider errored, not on the record count.
    return 0 if not failures else 1
