"""MyFitnessPal adapter.

MyFitnessPal deprecated its public API in 2019 and is not accepting new
developers, so there is no supported programmatic route for an individual.

This adapter drives a real Chromium instance with a persistent profile. You log
in once in a visible window; after that the session lives in the profile
directory and every daily run reuses it headlessly. No password is stored by
this agent, and nothing has to decrypt a browser's cookie store, which is what
makes this survive Chrome's app-bound cookie encryption on Windows.

It reads the printable-diary view rather than the React app, because that page
is a plain server-rendered table built for printing and therefore changes far
less often.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from .config import BROWSER_PROFILE

log = logging.getLogger(__name__)

BASE = "https://www.myfitnesspal.com"

# Reads the day's totals row out of the printable diary. Kept as page-side
# JavaScript so it works against the rendered DOM regardless of markup nesting.
EXTRACT_JS = r"""
() => {
  const num = (s) => {
    if (s == null) return null;
    const cleaned = String(s).replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const KEYS = [
    [/^calories?$/i, 'calories'],
    [/^(carbs?|carbohydrates?)/i, 'carbs'],
    [/^fat/i, 'fat'],
    [/^protein/i, 'protein'],
    [/^(fibre|fiber)/i, 'fiber'],
    [/^sugars?/i, 'sugar'],
    [/^sodium/i, 'sodium'],
  ];

  const classify = (header) => {
    const h = String(header || '').trim();
    for (const [re, key] of KEYS) if (re.test(h)) return key;
    return null;
  };

  for (const table of [...document.querySelectorAll('table')].reverse()) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) continue;

    // Locate the header row by finding one that mentions calories.
    let headerCells = null;
    for (const r of rows) {
      const cells = [...r.querySelectorAll('th,td')].map((c) => c.textContent.trim());
      if (cells.some((c) => /^calories?$/i.test(c))) { headerCells = cells; break; }
    }
    if (!headerCells) continue;

    // The day total is the LAST totals-style row; earlier ones are per-meal.
    let totalsCells = null;
    for (const r of rows) {
      const cells = [...r.querySelectorAll('th,td')].map((c) => c.textContent.trim());
      if (cells.length && /^total/i.test(cells[0])) totalsCells = cells;
    }
    if (!totalsCells) continue;

    const out = {};
    for (let i = 0; i < headerCells.length; i++) {
      const key = classify(headerCells[i]);
      if (key && i < totalsCells.length) {
        const v = num(totalsCells[i]);
        if (v !== null) out[key] = v;
      }
    }
    if (out.calories != null) return out;
  }
  return null;
}
"""


class MfpError(RuntimeError):
    pass


def _playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise MfpError(
            "playwright is not installed. Run:\n"
            "  pip install -r sync/requirements.txt\n"
            "  python -m playwright install chromium"
        ) from exc
    return sync_playwright


class MfpAdapter:
    """Context manager wrapping a persistent Chromium profile."""

    def __init__(self, username: str | None, headless: bool = True) -> None:
        self.username = username
        self.headless = headless
        self._pw = None
        self._context: Any = None

    def __enter__(self) -> "MfpAdapter":
        BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
        self._pw = _playwright()().start()
        self._context = self._pw.chromium.launch_persistent_context(
            str(BROWSER_PROFILE),
            headless=self.headless,
            viewport={"width": 1280, "height": 900},
            # A stock desktop UA: the printable diary is a normal page request,
            # and pretending to be something exotic only invites challenges.
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
            ),
        )
        return self

    def __exit__(self, *exc: object) -> None:
        try:
            if self._context:
                self._context.close()
        finally:
            if self._pw:
                self._pw.stop()

    def _page(self):
        if not self._context:
            raise MfpError("Browser context is not open.")
        return self._context.pages[0] if self._context.pages else self._context.new_page()

    # --- session ------------------------------------------------------------

    def is_signed_in(self) -> bool:
        page = self._page()
        page.goto(f"{BASE}/account/login", wait_until="domcontentloaded", timeout=45_000)
        # A signed-in user gets bounced away from the login page.
        page.wait_for_timeout(2500)
        return "/account/login" not in page.url

    def detect_username(self) -> str | None:
        """Read the account's username off the profile page."""
        page = self._page()
        page.goto(f"{BASE}/food/diary", wait_until="domcontentloaded", timeout=45_000)
        page.wait_for_timeout(2000)
        try:
            found = page.evaluate(
                r"""() => {
                  const m = document.body.innerHTML.match(/\/food\/diary\/([A-Za-z0-9_.\-]+)/);
                  if (m) return m[1];
                  const p = document.body.innerHTML.match(/\/profile\/([A-Za-z0-9_.\-]+)/);
                  return p ? p[1] : null;
                }"""
            )
            return found or None
        except Exception:  # noqa: BLE001
            return None

    def interactive_login(self) -> bool:
        """Open a visible window so you can sign in once by hand."""
        page = self._page()
        page.goto(f"{BASE}/account/login", wait_until="domcontentloaded", timeout=60_000)
        print("\nA browser window is open. Sign in to MyFitnessPal there.")
        print("Complete any captcha or two-factor prompt, then return here.")
        input("Press Enter once you can see your diary... ")
        return "/account/login" not in page.url

    # --- data ---------------------------------------------------------------

    def nutrition_for(self, day: date) -> dict[str, Any] | None:
        """Fetch one day's diary totals, or None if the day is empty."""
        if not self.username:
            raise MfpError("MyFitnessPal username is unknown.")

        iso = day.isoformat()
        url = f"{BASE}/reports/printable_diary/{self.username}?from={iso}&to={iso}"
        page = self._page()
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        page.wait_for_timeout(1500)

        if "/account/login" in page.url:
            raise MfpError(
                "The saved MyFitnessPal session has expired. "
                "Re-authenticate with: npm run sync:login"
            )

        try:
            totals = page.evaluate(EXTRACT_JS)
        except Exception as exc:  # noqa: BLE001
            raise MfpError(f"Could not read the diary page for {iso}: {exc}") from exc

        if not totals or totals.get("calories") in (None, 0):
            log.info("No diary entries for %s", iso)
            return None

        return {
            "date": iso,
            "raw_mfp_calories": totals.get("calories"),
            "protein": totals.get("protein"),
            "carbs": totals.get("carbs"),
            "fat": totals.get("fat"),
            "fiber": totals.get("fiber"),
            "sugar": totals.get("sugar"),
            "sodium": totals.get("sodium"),
            "nutrition_source": "mfp",
        }
