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


def _is_closed(exc: Exception) -> bool:
    """Whether an exception means the browser window went away."""
    text = str(exc).lower()
    return "targetclosed" in type(exc).__name__.lower() or any(
        s in text for s in ("has been closed", "target closed", "browser has been closed")
    )


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
        self.channel: str | None = None
        self._pw = None
        self._context: Any = None

    # Prefer a browser already installed on the machine over Playwright's
    # bundled Chromium. The bundled build needs a Visual C++ redistributable
    # that plenty of Windows machines lack, and fails with an opaque
    # "spawn UNKNOWN" when it is missing. An installed Chrome also stays
    # patched without this project having to ship browser updates.
    _CHANNELS = ("chrome", "msedge", None)

    def __enter__(self) -> "MfpAdapter":
        BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
        self._pw = _playwright()().start()

        launch_errors: list[str] = []
        for channel in self._CHANNELS:
            try:
                kwargs: dict[str, Any] = {
                    "headless": self.headless,
                    "viewport": {"width": 1280, "height": 900},
                }
                if channel:
                    kwargs["channel"] = channel
                self._context = self._pw.chromium.launch_persistent_context(
                    str(BROWSER_PROFILE), **kwargs
                )
                self.channel = channel or "bundled chromium"
                log.info("Launched %s", self.channel)
                return self
            except Exception as exc:  # noqa: BLE001 - try the next candidate
                launch_errors.append(f"{channel or 'bundled chromium'}: {exc}".split("Call log")[0].strip())

        self._pw.stop()
        self._pw = None
        raise MfpError(
            "Could not launch a browser. Tried Chrome, Edge and Playwright's bundled "
            "Chromium:\n  - " + "\n  - ".join(launch_errors)
        )

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

    def login_with_password(self, email: str, password: str) -> bool:
        """Sign in on MyFitnessPal's own form, with no third-party provider.

        This is the preferred path. Google deliberately refuses OAuth sign-in
        from automated browsers ("This browser or app may not be secure"), which
        is a security control, not an obstacle to route around. Signing in
        against MyFitnessPal directly avoids the question entirely, needs no
        visible window, and re-establishes the session by itself whenever it
        lapses.
        """
        page = self._page()
        page.goto(f"{BASE}/account/login", wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2500)

        if "/account/login" not in page.url:
            log.info("Already signed in.")
            return True

        email_selectors = [
            'input[name="username"]',
            'input[type="email"]',
            'input[name="email"]',
            'input[autocomplete="username"]',
            '#email',
        ]
        password_selectors = [
            'input[name="password"]',
            'input[type="password"]',
            'input[autocomplete="current-password"]',
            '#password',
        ]

        def fill_first(selectors: list[str], value: str, what: str) -> None:
            for sel in selectors:
                try:
                    field = page.locator(sel).first
                    if field.count() > 0 and field.is_visible():
                        field.fill(value, timeout=10_000)
                        return
                except Exception:  # noqa: BLE001 - try the next selector
                    continue
            raise MfpError(f"Could not find the {what} field on the MyFitnessPal login page.")

        fill_first(email_selectors, email, "email")
        fill_first(password_selectors, password, "password")

        for sel in ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Log In")',
                    'button:has-text("Sign In")', 'button:has-text("Continue")']:
            try:
                btn = page.locator(sel).first
                if btn.count() > 0 and btn.is_visible():
                    btn.click(timeout=10_000)
                    break
            except Exception:  # noqa: BLE001
                continue
        else:
            page.keyboard.press("Enter")

        # Give the redirect, and any interstitial, time to settle.
        for _ in range(20):
            page.wait_for_timeout(1500)
            if "/account/login" not in page.url:
                log.info("Signed in to MyFitnessPal with a password.")
                return True

        body = ""
        try:
            body = page.inner_text("body")[:400]
        except Exception:  # noqa: BLE001
            pass
        if "captcha" in body.lower() or "verify" in body.lower():
            raise MfpError(
                "MyFitnessPal presented a captcha or verification step. Run once with "
                "HEADLESS=0 to clear it by hand; the session is reused afterwards."
            )
        raise MfpError(
            "MyFitnessPal did not accept those credentials. If your account was created "
            "with Google sign-in, set a password first at myfitnesspal.com/account/forgot_password"
        )

    def interactive_login(self, timeout_seconds: int = 420) -> bool:
        """Open a visible window and wait for you to sign in.

        Polls for success instead of waiting on a keypress, so this works when
        launched from a script or a scheduler with no attached terminal. Sign in
        however you normally do, including "Continue with Google".
        """
        page = self._page()
        page.goto(f"{BASE}/account/login", wait_until="domcontentloaded", timeout=60_000)

        # An unlabelled browser window that appears on its own looks like
        # something to close, not something to use. Raise it and say what it is.
        try:
            page.bring_to_front()
            page.add_style_tag(
                content="""
                #fitsync-banner{position:fixed;inset:0 0 auto 0;z-index:2147483647;
                  background:#0b0f19;color:#e8eefc;font:600 15px/1.5 system-ui,sans-serif;
                  padding:14px 20px;text-align:center;border-bottom:3px solid #38e07b}
                #fitsync-banner b{color:#38e07b}
                body{padding-top:64px !important}
                """
            )
            page.evaluate(
                """() => {
                  if (document.getElementById('fitsync-banner')) return;
                  const el = document.createElement('div');
                  el.id = 'fitsync-banner';
                  el.innerHTML = 'Fitness dashboard setup: <b>sign in to MyFitnessPal here</b>, '
                    + 'then leave this window open until your diary loads. Closing it early saves nothing.';
                  document.body.prepend(el);
                }"""
            )
        except Exception:  # noqa: BLE001 - decoration must never block sign-in
            pass

        print(f"\nA {self.channel} window is open at the MyFitnessPal login page.")
        print('Sign in however you normally do, including "Continue with Google".')
        print("Leave the window open until your food diary loads.")
        print(f"Waiting up to {timeout_seconds // 60} minutes.\n", flush=True)

        waited = 0
        step = 3
        while waited < timeout_seconds:
            try:
                page.wait_for_timeout(step * 1000)
                url = page.url
            except Exception as exc:  # noqa: BLE001
                # Closing the window is a perfectly reasonable thing to do, and
                # it should read as "you closed it", not as a stack trace.
                if _is_closed(exc):
                    print(
                        "\nThe browser window was closed before sign-in finished."
                        "\nNothing was saved. Run the command again and leave the window"
                        " open until your diary loads.",
                        flush=True,
                    )
                    return False
                raise

            waited += step

            # Google's consent screens are part of the flow, so only a URL that
            # is neither the MFP login nor a Google auth page counts as done.
            settled = "/account/login" not in url and "accounts.google.com" not in url
            if settled:
                try:
                    page.wait_for_timeout(2500)
                    if "/account/login" not in page.url:
                        print(f"Signed in after {waited}s.", flush=True)
                        return True
                except Exception as exc:  # noqa: BLE001
                    if _is_closed(exc):
                        # Reaching a signed-in URL and then closing the window is
                        # a success: the cookie is already on disk.
                        print("\nWindow closed after sign-in. Session saved.", flush=True)
                        return True
                    raise

            if waited % 30 == 0:
                remaining = (timeout_seconds - waited) // 60
                print(f"  still waiting ({waited}s, {remaining} min left)...", flush=True)

        print("\nTimed out waiting for sign-in. Nothing was saved.")
        return False

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
