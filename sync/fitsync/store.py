"""Supabase writer.

The agent authenticates as the ordinary application user and writes through
PostgREST, so it is governed by exactly the same row-level security as the web
app. It deliberately does NOT use the service-role key: an automated job that
runs unattended on a laptop is the last place a key that bypasses RLS belongs.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Iterable

from .config import Config


class StoreError(RuntimeError):
    pass


def _request(url: str, *, method: str, headers: dict[str, str], body: Any = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise StoreError(f"{method} {url} -> {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise StoreError(f"{method} {url} failed: {exc.reason}") from exc


class Store:
    def __init__(self, config: Config) -> None:
        self.config = config
        self._token: str | None = None
        self._user_id: str | None = None

    # --- auth ---------------------------------------------------------------

    def sign_in(self) -> None:
        payload = _request(
            f"{self.config.auth_url}/token?grant_type=password",
            method="POST",
            headers={
                "apikey": self.config.supabase_anon_key,
                "Content-Type": "application/json",
            },
            body={"email": self.config.app_email, "password": self.config.app_password},
        )
        if not payload or "access_token" not in payload:
            raise StoreError("Sign-in did not return an access token.")
        self._token = payload["access_token"]
        self._user_id = payload.get("user", {}).get("id")
        if not self._user_id:
            raise StoreError("Sign-in did not return a user id.")

    @property
    def user_id(self) -> str:
        if not self._user_id:
            raise StoreError("Not signed in.")
        return self._user_id

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        if not self._token:
            raise StoreError("Not signed in.")
        headers = {
            "apikey": self.config.supabase_anon_key,
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    # --- reads --------------------------------------------------------------

    def get_settings(self) -> dict[str, Any]:
        rows = _request(
            f"{self.config.rest_url}/app_settings?user_id=eq.{self.user_id}&select=*",
            method="GET",
            headers=self._headers(),
        )
        if not rows:
            raise StoreError(
                "No settings row exists for this account. Sign in to the web app once first."
            )
        return rows[0]

    def existing_activity_ids(self) -> set[str]:
        rows = _request(
            f"{self.config.rest_url}/activities"
            f"?user_id=eq.{self.user_id}&external_source=eq.garmin&select=external_id",
            method="GET",
            headers=self._headers(),
        )
        return {r["external_id"] for r in (rows or []) if r.get("external_id")}

    # --- writes -------------------------------------------------------------

    def upsert_daily(self, rows: Iterable[dict[str, Any]]) -> int:
        payload = [{"user_id": self.user_id, **r} for r in rows]
        if not payload:
            return 0
        _request(
            f"{self.config.rest_url}/daily_metrics?on_conflict=user_id,date",
            method="POST",
            headers=self._headers("resolution=merge-duplicates,return=minimal"),
            body=payload,
        )
        return len(payload)

    def upsert_activities(self, rows: Iterable[dict[str, Any]]) -> int:
        payload = [{"user_id": self.user_id, **r} for r in rows]
        if not payload:
            return 0
        _request(
            f"{self.config.rest_url}/activities?on_conflict=user_id,external_source,external_id",
            method="POST",
            headers=self._headers("resolution=merge-duplicates,return=minimal"),
            body=payload,
        )
        return len(payload)

    # --- sync logging -------------------------------------------------------

    def start_sync(self, provider: str) -> str:
        rows = _request(
            f"{self.config.rest_url}/sync_logs",
            method="POST",
            headers=self._headers("return=representation"),
            body=[
                {
                    "user_id": self.user_id,
                    "provider": provider,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "status": "running",
                }
            ],
        )
        return rows[0]["id"]

    def finish_sync(
        self,
        log_id: str,
        *,
        status: str,
        records: int = 0,
        error: str | None = None,
    ) -> None:
        _request(
            f"{self.config.rest_url}/sync_logs?id=eq.{log_id}",
            method="PATCH",
            headers=self._headers("return=minimal"),
            body={
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "status": status,
                "records_imported": records,
                # Truncated so a stack trace cannot bloat the row.
                "error_message": (error[:800] if error else None),
            },
        )

    def recent_syncs(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = _request(
            f"{self.config.rest_url}/sync_logs"
            f"?user_id=eq.{self.user_id}&select=*&order=started_at.desc&limit={limit}",
            method="GET",
            headers=self._headers(),
        )
        return rows or []
