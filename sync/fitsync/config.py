"""Configuration loading.

Every secret comes from the environment or a gitignored .env beside the agent.
Nothing here is ever written back to disk in plaintext, and nothing here is
readable by the deployed web app.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

AGENT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = AGENT_ROOT / ".env"


def _state_root() -> Path:
    r"""Where to keep the browser profile and cached tokens.

    Deliberately NOT inside the repository. Chromium cannot open a user-data
    directory that lives in a OneDrive-synced folder (it fails with a bare
    "spawn UNKNOWN"), and this project is commonly checked out under
    OneDrive\Documents. Keeping this state in LOCALAPPDATA also means a cloud
    sync client never uploads a live login session.
    """
    override = os.environ.get("FITSYNC_STATE_DIR", "").strip()
    if override:
        return Path(override)

    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    else:
        base = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
    return Path(base) / "fitness-dashboard-sync"


STATE_ROOT = _state_root()

# Playwright stores the logged-in MyFitnessPal session here. Treat it like a
# password: it grants access to the account until the session expires.
BROWSER_PROFILE = STATE_ROOT / "mfp-profile"
GARMIN_TOKEN_DIR = STATE_ROOT / "garmin-tokens"


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader, so the agent has no dependency on python-dotenv."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Real environment variables win, so a scheduled task can override .env.
        os.environ.setdefault(key, value)


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_anon_key: str
    app_email: str
    app_password: str
    garmin_email: str | None
    garmin_password: str | None
    mfp_email: str | None
    mfp_password: str | None
    mfp_username: str | None
    timezone: str
    backfill_days: int
    headless: bool

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/rest/v1"

    @property
    def auth_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


def _require(name: str, strict: bool = True) -> str:
    value = os.environ.get(name, "").strip()
    if not value and strict:
        raise ConfigError(
            f"{name} is not set. Copy sync/.env.example to sync/.env and fill it in."
        )
    return value


def load_config(strict: bool = True) -> Config:
    """Load configuration.

    `strict=False` returns a partially-filled config instead of raising, which
    is what the doctor command needs: refusing to load because a value is
    missing would stop it reporting which value is missing.
    """
    _load_dotenv(ENV_PATH)
    return Config(
        supabase_url=_require("SUPABASE_URL", strict),
        supabase_anon_key=_require("SUPABASE_ANON_KEY", strict),
        app_email=_require("APP_EMAIL", strict),
        app_password=_require("APP_PASSWORD", strict),
        # Garmin credentials are optional: without them the agent still runs
        # MyFitnessPal and reports Garmin as skipped rather than failing.
        garmin_email=os.environ.get("GARMIN_EMAIL", "").strip() or None,
        garmin_password=os.environ.get("GARMIN_PASSWORD", "").strip() or None,
        # MyFitnessPal credentials are optional: with them the agent signs in by
        # itself, without them it falls back to a saved browser session.
        mfp_email=os.environ.get("MFP_EMAIL", "").strip() or None,
        mfp_password=os.environ.get("MFP_PASSWORD", "").strip() or None,
        mfp_username=os.environ.get("MFP_USERNAME", "").strip() or None,
        timezone=os.environ.get("TIMEZONE", "America/Chicago").strip(),
        backfill_days=int(os.environ.get("BACKFILL_DAYS", "3")),
        headless=os.environ.get("HEADLESS", "1").strip() != "0",
    )
