# Energy Deficit Mission Control

**Live:** https://fitness-dashboard-emv.pages.dev/

A personal fitness dashboard built around a single question:

> How much verified, adjusted progress have I made toward my 84,000 kcal energy-deficit mission?

It is not a calorie tracker. It is a mission tracker that happens to consume calorie data from Garmin and MyFitnessPal.

---

## The mission

```
20 lb to lose  x  3,500 kcal/lb  =  70,000 kcal theoretical
70,000  x  1.20 uncertainty buffer  =  84,000 kcal mission target
```

The 84,000 is **derived, not hard-coded**. Change your target weight, calories-per-pound, or buffer in Settings and the mission recalculates. There is also an explicit override field if you want to pin a number.

---

## Raw versus adjusted

Two planning assumptions sit at the centre of the model:

| Source | Assumption | Factor | Reasoning |
| --- | --- | --- | --- |
| Garmin | Over-reports expenditure | **x 0.90** | Wrist-based calorie estimates are consistently generous |
| MyFitnessPal | Under-reports intake | **x 1.10** | Logged food misses oil, portion drift, and untracked bites |

```
Garmin reported:      2,800 kcal
Adjustment:           x 0.90
Adjusted expenditure: 2,520 kcal

MyFitnessPal logged:  2,000 kcal
Adjustment:           x 1.10
Adjusted intake:      2,200 kcal

Today's adjusted deficit:  320 kcal
```

The design system, including how contrast is solved and verified, is written up in **[docs/DESIGN.md](docs/DESIGN.md)**.

**These are assumptions, not measurements**, and the app never lets you forget it. Every calorie figure in the UI is tagged `raw`, `adjusted`, `estimated`, or `derived`, and the full arithmetic chain is shown rather than hidden behind a single number.

### Why they are configurable

Nobody knows your true correction factors, including you. The Mission page runs a **model check** that compares the weight loss your cumulative deficit predicts against what the scale actually did, and reports the gap along with the single multiplier that would have reconciled them.

It does **not** apply that multiplier. An automatic feedback loop between a noisy scale and the model being graded by it is how you end up chasing water weight. It tells you; you decide.

### The design rule that makes this safe

The database stores **raw source data only**. There is no `adjusted_expenditure` column, no `daily_deficit` column, and no stored cumulative total. Every adjusted figure is computed at read time from your current settings.

The Garmin factor moved from 0.85 to 0.90 on 26 August 2026 and every day of history repriced on the next page load, with not one stored row modified. That property is enforced by construction, and covered by a test.

### Incomplete days count as zero

A day contributes to the mission only when **both** expenditure and intake are known. A day with Garmin data but no food log is not a 2,380 kcal win, it is an unknown. The dashboard says so, out loud, on the card and in the insights.

---

## What is in the box

```
fitness-dashboard/
├── web/                    React + TypeScript + Vite PWA
│   └── src/
│       ├── core/           Calculation engine (pure TS, no React)
│       ├── lib/            Data layer, backends, importers, cache
│       ├── components/     UI primitives, cards, charts
│       └── pages/          Dashboard, Mission, Activity, Analytics, Check-In,
│                           Integrations, Settings, Display
├── sync/                   Python daily sync agent (Garmin + MyFitnessPal)
├── supabase/
│   ├── migrations/         Schema, row-level security, triggers
│   └── seed.sql            Baseline profile
├── docs/
│   ├── SETUP.md            Full setup, start here
│   └── SYNC-AGENT.md       Sync agent details and troubleshooting
└── .github/workflows/      GitHub Pages deployment
```

The calculation engine in `web/src/core/` has no dependency on React, the network, or storage. It is importable anywhere.

---

## Setup

Full instructions are in **[docs/SETUP.md](docs/SETUP.md)**. The short version:

```bash
npm run install:web           # install the web app
cp web/.env.example web/.env  # add your Supabase URL and anon key
npm run dev                   # http://localhost:5173
```

To try it with no backend at all, put `VITE_DEMO_MODE=1` in `web/.env.local`. The whole app runs against browser-local storage with 45 days of generated data, clearly labelled as demo.

---

## Integrations: the honest situation

**Neither service will grant you API access.**

- Garmin's Connect Developer Program requires a legal entity and explicitly rejects personal-use applications. It is also currently suspended for new applicants.
- MyFitnessPal deprecated its public API in 2019 and is not accepting new developers.

There is no OAuth path. Rather than ship adapter scaffolding for APIs that will never be granted, the **laptop sync agent is the integration**:

- **Garmin** signs in through the `garminconnect` library, which uses the same mobile SSO flow the official Garmin app does, and caches tokens locally. It pulls calories, steps, intraday step buckets, distance, heart rate, sleep stages, stress, body battery, SpO2, and every activity.
- **MyFitnessPal** is read through its own diary-sharing feature, over plain HTTP with no browser and no login. Its login form sits behind a Cloudflare bot check that rejects automated browsers regardless of who types the password, and that is not something this project tries to defeat. Setting the diary to "Locked with a Key" exposes a JSON endpoint the agent reads directly: structured figures, one request per date range, nothing that expires.

Both run **four times a day** (10:00, 14:00, 18:00 and 21:00 Central) as a GitHub Actions cron, not on the laptop. Each run re-fetches the last three days, so a missed window heals itself. See **[docs/SYNC-AGENT.md](docs/SYNC-AGENT.md)**.

```bash
npm run install:sync   # python dependencies
npm run sync:doctor    # check every link in the chain and say what to fix
npm run sync           # both providers
npm run sync:status    # recent run history
```

### When a sync fails

It fails **loudly**. A banner appears on every page after two quiet days, the Integrations page shows the error, and the Check-In tab always accepts manual entry. You will never be blocked on a scraper.

### Import fallbacks

The Integrations page accepts Garmin and MyFitnessPal CSV exports for backfilling history or covering a gap. Columns are matched by fuzzy header name rather than position, multi-row MyFitnessPal exports are summed per date, and skipped rows are reported rather than silently dropped.

---

## Getting in

There is no password screen. The app opens to a numeric keypad, and the code is
the only way in.

The code is **verified on the server**, by a Cloudflare Pages Function that
holds the account credentials as environment secrets. The browser sends a code
and receives a Supabase session; nothing sensitive is present in the published
bundle, and reading the JavaScript reveals nothing usable. Verified on every
deploy: the bundle contains no email, no password, and not even the code hash.

The session that comes back is an ordinary Supabase session, so every request
afterwards is still governed by row-level security exactly as before. The code
replaces the login form, not the access control underneath it.

**The trade worth understanding.** A short numeric code is a small search space,
and the endpoint is reachable by anyone who finds the URL. Three things blunt
that: every attempt costs a fixed delay regardless of outcome, repeated failures
from one address are locked out, and the comparison is timing-safe. Guessing is
slow and noisy rather than impossible, which is why the code length is
configurable. Four digits is 10,000 combinations; six is a million, for two
extra taps.

The Supabase publishable key still ships in the bundle. That is by design: it is
a public identifier, and row-level security is what protects the data.

## Mobile and PWA

Installable from the iPhone share sheet. Bottom navigation, 44px minimum touch targets, safe-area insets for the notch and home indicator, and a check-in form that needs two numbers and one tap.

Perceived speed comes from a stale-while-revalidate cache: the app paints your last known numbers in one frame from local storage, then refreshes behind them. It also refreshes whenever the app returns to the foreground. Route-level code splitting keeps the chart library out of the initial load, so opening the dashboard costs about 106 kB gzipped rather than 234 kB.

## Wall display

`/#/display` is a non-interactive, oversized, glanceable view for a tablet, monitor, or Raspberry Pi. It refreshes itself every 15 minutes.

---

## Design

The interface follows Apple's Human Interface Guidelines as platform-agnostic
rules, with the anti-default discipline of the taste-skill framework applied on
top. Concretely:

**Contrast is solved, not eyeballed.** Every foreground token was computed
numerically against the surface it actually sits on. Body and secondary text
clear 7:1, small tertiary labels clear 7:1 (HIG asks for that on small text),
and chart axes and placeholders clear 4.6:1. The audit runs against rendered
DOM, not the palette in the abstract: **713 text elements across 8 routes in
both appearances, zero failures.**

That audit found and fixed real defects. Chart axis labels were at 2.49:1 and
input placeholders at 2.68:1, both well under the 4.5:1 floor. Fourteen labels
were rendering at 9 to 10px, below the 11pt minimum legible size.

**Dual appearance, with parity.** The light palette is not an inversion. Greens
and ambers that read well on near-black are far too bright in light mode, so
each was re-solved. They were re-solved twice: the first pass targeted white and
left the accent, warn and danger tones failing by a tenth of a point on the
tinted nav and banner surfaces. Following the platform convention there is
deliberately **no in-app theme switch**; the app follows the system appearance.

**Every colour comes from a token.** No component holds a hex value, which is
what made light mode a token swap rather than a rewrite. Charts read the same
tokens at runtime through `useChartTheme`, because Recharts needs literal
strings and duplicating the palette in JavaScript would let the two drift.

**Typeface:** Geist and Geist Mono, not Inter. Genuine tabular figures matter
more here than novelty, and taste-skill discourages Inter as a default reach.

**One radius scale**, enforced from tokens: cards 16px, controls 12px, chips
pill. Mixed radii are what make an interface look assembled rather than designed.

**Accessibility beyond colour.** `prefers-reduced-motion` and
`prefers-reduced-transparency` are both honoured, the latter swapping the
blurred bars for solid fills. Every chart carries a written summary stating what
the data shows, exposed as its accessible label, because a picture is invisible
to a screen reader. Focus rings are explicit on every interactive element.

**Interaction states are complete**, not just the happy path: skeleton loaders
shaped like the real layout rather than spinners, composed empty states that say
how to populate them, inline validation below the field it belongs to, and a
tactile `active:scale` on press.

---

## Development

```bash
npm test         # 54 tests: calculation engine and CSV importers
npm run typecheck
npm run build
```

The test suite covers the worked examples from the specification (2,800 x 0.85 and 2,000 x 1.10 giving 180 kcal, pinned to those factors so changing the shipped default cannot silently rewrite what they assert), the exact 84,000 kcal derivation, surplus days subtracting, incomplete days contributing nothing, factor changes repricing history without mutating raw data, the Navy body-fat formula, rolling averages and least-squares trends, streak handling across missing days, pace derived from totals rather than averaged, the projection horizon guard, and the CSV importers (quoted fields, BOMs, US dates, per-meal summing, and missing-column failure modes).

---

## Deployment

Push to `main`. The workflow typechecks, runs the tests, builds, refuses to
publish a bundle that is not actually configured, and deploys to Cloudflare
Pages.

Hosting is Cloudflare rather than GitHub Pages for one specific reason: GitHub
Pages project sites inherit the custom domain set on the account's user site,
so this dashboard was being served from a path under a personal professional
domain with no way to opt out. Cloudflare gives it its own origin.

Four repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`CLOUDFLARE_API_TOKEN` (scoped to Cloudflare Pages:Edit and nothing else), and
`CLOUDFLARE_ACCOUNT_ID`.

Routing uses `HashRouter`, and `_redirects` serves the shell for any deep path.
`_headers` sets frame, sniffing, referrer and permissions policy, caches
fingerprinted assets immutably, and keeps the shell revalidating so a deploy
always reaches a device that already has the old one.

## Self-hosting later

Nothing here is tied to GitHub Pages. `web/dist` is a static bundle that any web server will serve; set `VITE_BASE_PATH=/` for a root domain. Supabase can be swapped for a self-hosted instance by changing two environment variables, or replaced entirely by writing a new implementation of the `Backend` interface in `web/src/lib/backend/types.ts`. The local-storage backend in that folder is a working example of doing exactly that.
