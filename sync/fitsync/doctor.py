"""Setup diagnostics.

`python run_sync.py doctor` checks every link in the chain and tells you which
one is broken and what to do about it. Written because the failure modes here
are all external (an expired browser session, a federated Garmin account, a
missing settings row) and a generic traceback tells you none of that.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date

from .config import BROWSER_PROFILE, GARMIN_TOKEN_DIR, Config
from .store import Store, StoreError


@dataclass
class Check:
    name: str
    ok: bool
    detail: str
    fix: str | None = None


def _fmt(check: Check) -> str:
    mark = "PASS" if check.ok else "FAIL"
    line = f"  [{mark}] {check.name}: {check.detail}"
    if not check.ok and check.fix:
        line += f"\n         fix: {check.fix}"
    return line


def check_config(config: Config) -> list[Check]:
    out = [
        Check(
            "Supabase URL",
            config.supabase_url.startswith("https://") and "supabase.co" in config.supabase_url,
            config.supabase_url or "(unset)",
            "Set SUPABASE_URL in sync/.env to your project URL.",
        ),
        Check(
            "Supabase key",
            bool(config.supabase_anon_key),
            f"{config.supabase_anon_key[:22]}..." if config.supabase_anon_key else "(unset)",
            "Set SUPABASE_ANON_KEY in sync/.env. Use the publishable or anon key, not a secret key.",
        ),
        Check(
            "Dashboard account",
            bool(config.app_email and config.app_password),
            config.app_email or "(unset)",
            "Set APP_EMAIL and APP_PASSWORD in sync/.env to the account you sign in to the site with.",
        ),
    ]

    if config.garmin_email and config.garmin_password:
        out.append(Check("Garmin credentials", True, config.garmin_email))
    else:
        out.append(
            Check(
                "Garmin credentials",
                False,
                "not set, Garmin will be skipped",
                "Set GARMIN_EMAIL and GARMIN_PASSWORD in sync/.env. If you sign in to Garmin "
                "with Google, you have no Garmin password yet: go to connect.garmin.com/signin, "
                "choose 'Forgot password', and set one. The Google sign-in keeps working too.",
            )
        )
    return out


def check_supabase(config: Config) -> tuple[list[Check], Store | None]:
    if not (config.supabase_url and config.supabase_anon_key and config.app_email and config.app_password):
        return [
            Check(
                "Supabase sign-in",
                False,
                "skipped, configuration incomplete",
                "Fill in the missing values above first.",
            )
        ], None

    store = Store(config)
    try:
        store.sign_in()
    except StoreError as exc:
        return [
            Check(
                "Supabase sign-in",
                False,
                str(exc)[:160],
                "Confirm APP_EMAIL and APP_PASSWORD match a user in Authentication > Users, "
                "and that the user's email is confirmed.",
            )
        ], None

    checks = [Check("Supabase sign-in", True, f"authenticated as {config.app_email}")]

    try:
        settings = store.get_settings()
        checks.append(
            Check(
                "Settings row",
                True,
                f"goal {settings.get('morning_step_goal')} steps by "
                f"{str(settings.get('morning_deadline'))[:5]}, "
                f"factors {settings.get('garmin_adjustment_factor')} / "
                f"{settings.get('intake_adjustment_factor')}",
            )
        )
    except StoreError as exc:
        checks.append(
            Check(
                "Settings row",
                False,
                str(exc)[:160],
                "Open the website once and sign in; the row is created on first signup by a "
                "database trigger.",
            )
        )

    try:
        rows = store.recent_syncs(5)
        if rows:
            last = rows[0]
            checks.append(
                Check(
                    "Write access",
                    True,
                    f"last run {last.get('provider')} {last.get('status')} "
                    f"at {str(last.get('started_at'))[:19]}",
                )
            )
        else:
            checks.append(Check("Write access", True, "reachable, no sync history yet"))
    except StoreError as exc:
        checks.append(Check("Write access", False, str(exc)[:160], "Check the row-level security policies."))

    return checks, store


def check_garmin(config: Config) -> list[Check]:
    if not (config.garmin_email and config.garmin_password):
        return []

    from .garmin import GarminAdapter, GarminError

    token_note = "cached token present" if GARMIN_TOKEN_DIR.exists() else "no cached token, will log in fresh"
    try:
        adapter = GarminAdapter(config.garmin_email, config.garmin_password, config.timezone)
        adapter.connect()
    except GarminError as exc:
        message = str(exc)
        # A federated account is the single most likely cause of a clean
        # credential rejection, and the error Garmin returns does not say so.
        federated = any(s in message.lower() for s in ("401", "invalid", "credential", "unauthor"))
        return [
            Check(
                "Garmin login",
                False,
                message[:200],
                (
                    "If you sign in to Garmin with Google, this is expected: the library talks to "
                    "Garmin's own SSO and your account has no Garmin password. Go to "
                    "connect.garmin.com/signin, choose 'Forgot password', set a password, and put "
                    "it in GARMIN_PASSWORD. Signing in with Google keeps working alongside it."
                    if federated
                    else "Check GARMIN_EMAIL and GARMIN_PASSWORD. If the account uses multi-factor "
                    "authentication, run this from a terminal you can type into."
                ),
            )
        ]

    checks = [Check("Garmin login", True, token_note)]

    today = date.today()
    stats = adapter._safe("get_stats", today.isoformat()) or {}
    if stats:
        checks.append(
            Check(
                "Garmin daily data",
                True,
                f"{stats.get('totalKilocalories')} kcal, {stats.get('totalSteps')} steps today",
            )
        )
    else:
        checks.append(
            Check(
                "Garmin daily data",
                False,
                "no summary returned for today",
                "Usually means the watch has not synced to Garmin Connect yet today. Harmless: "
                "the three-day backfill window picks it up on the next run.",
            )
        )

    from datetime import time as _time

    steps = adapter.steps_before(today, _time(9, 0))
    checks.append(
        Check(
            "Garmin intraday steps",
            steps is not None,
            f"{steps} steps before 09:00" if steps is not None else "no intraday buckets yet",
            None
            if steps is not None
            else "Morning Mission tracking needs these. They appear once the watch syncs.",
        )
    )
    return checks


MFP_NOTE = (
    "MyFitnessPal cannot be automated: its login form is behind a Cloudflare "
    "Turnstile bot check that fails for any automated browser, and this project "
    "does not defeat bot checks. Enter calories on the dashboard instead, which "
    "takes about ten seconds, or import a MyFitnessPal CSV to backfill. Garmin "
    "still syncs automatically and covers everything else."
)


MFP_SETUP = (
    "In MyFitnessPal go to Settings > Diary Settings > Diary Sharing and choose "
    "'Locked with a Key' (recommended, keeps the diary private) or 'Public'. Put "
    "your username in MFP_USERNAME and the key in MFP_DIARY_KEY in sync/.env. No "
    "login is involved: the printable diary is gated by that sharing setting, not "
    "by authentication."
)


def check_mfp(config: Config) -> list[Check]:
    """Check the printable diary over plain HTTP.

    The login form is behind a Cloudflare bot check that cannot be automated and
    is not used. Nothing here needs a browser.
    """
    if not config.mfp_username:
        return [
            Check(
                "MyFitnessPal",
                False,
                "MFP_USERNAME not set, calories are entered by hand",
                MFP_SETUP,
            )
        ]

    from .mfp_http import MfpHttpAdapter

    adapter = MfpHttpAdapter(config.mfp_username, config.mfp_diary_key)
    readable, detail = adapter.check_access()
    if not readable:
        return [Check("MyFitnessPal diary", False, detail, MFP_SETUP)]

    checks = [Check("MyFitnessPal diary", True, f"{config.mfp_username}: {detail}")]

    try:
        row = adapter.nutrition_for(date.today())
    except Exception as exc:  # noqa: BLE001
        return checks + [Check("MyFitnessPal read", False, str(exc)[:200], MFP_SETUP)]

    if row:
        checks.append(
            Check("MyFitnessPal read", True, f"{row['raw_mfp_calories']:.0f} kcal logged today")
        )
    else:
        checks.append(
            Check(
                "MyFitnessPal read",
                True,
                "diary readable, nothing logged today yet",
            )
        )
    return checks


def run_doctor(config: Config) -> int:
    print("\nEnergy Deficit Mission Control: setup check\n")

    groups: list[tuple[str, list[Check]]] = []

    groups.append(("Configuration", check_config(config)))
    supabase_checks, _ = check_supabase(config)
    groups.append(("Supabase", supabase_checks))
    groups.append(("Garmin", check_garmin(config)))
    groups.append(("MyFitnessPal", check_mfp(config)))

    failures = 0
    for title, checks in groups:
        if not checks:
            continue
        print(f"{title}")
        for c in checks:
            print(_fmt(c))
            if not c.ok:
                failures += 1
        print()

    if failures == 0:
        print("Everything checks out. Run: npm run sync\n")
    else:
        print(f"{failures} item(s) need attention. Each one above says how to fix it.\n")
    return 0 if failures == 0 else 1
