# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner of the account, on his own phone and his own laptop. There
is no second user, no sharing, no roles, no onboarding for a stranger. The lock
screen exists to stop a casual passer-by, not an attacker.

He opens it several times a day, usually for a few seconds: after a walk, before
a meal, last thing at night. The long sessions are rare and mostly happen on the
laptop.

## Product Purpose

Track cumulative progress toward a single, explicitly chosen goal: an **84,000
kcal energy deficit**, derived from 20 lb at 3,500 kcal/lb plus a 20% uncertainty
buffer.

The product exists because the number that matters is a running total nobody
else shows. Garmin shows today. MyFitnessPal shows today. Neither multiplies its
own figures by a correction factor, and neither carries the sum forward. Success
is knowing, in one glance, how much of the 84,000 is banked and whether today
added to it or took from it.

## Positioning

Two things a neighboring app could not truthfully copy:

1. **It states its assumptions and shows the arithmetic.** Garmin over-reports
   expenditure and logged intake under-reports, so the model applies x0.90 and
   x1.10. Every figure in the UI is labelled `raw`, `adjusted`, `estimated`, or
   `derived`, and the raw to factor to adjusted chain is drawn rather than
   collapsed into one number.
2. **The database stores raw source data only.** There is no
   `adjusted_expenditure` column, no `daily_deficit`, no stored cumulative
   total. Every adjusted figure is computed at read time from current settings,
   so changing a factor reprices all of history without mutating a row. The
   Garmin factor moved from 0.85 to 0.90 on 26 Aug 2026 and every day repriced
   on the next page load.

## Operating Context

- **Two upstream sources, neither of which offers a real API for this.** Garmin
  through `garminconnect` mobile SSO; MyFitnessPal through its Diary Sharing
  endpoint, reached with a diary key. The MyFitnessPal login path is closed by
  Cloudflare Turnstile and is not to be defeated.
- **Sync runs four times a day in GitHub Actions** (10:00, 14:00, 18:00, 21:00
  US Central), not on the laptop. Each run re-fetches the last three days, so a
  missed window heals itself.
- **Garmin's servers only hold what the watch has uploaded.** The phone app
  reads the watch live over Bluetooth and is routinely hours ahead. This is the
  single most common reason to distrust the dashboard, so `garmin_data_through`
  records the moment the figures describe and the UI says so.
- Deployed on Cloudflare Pages, deliberately not on the owner's personal domain.
- Installed to the phone home screen as a PWA, so it opens offline to a cached
  snapshot.

## Capabilities and Constraints

- **A day counts toward the mission only when both sides exist.** An expenditure
  figure with no logged intake contributes zero, not a deficit. Most days are
  currently incomplete, and the UI has to be honest about that rather than
  flattering.
- Weight, waist and neck are entered by hand. The daily check-in asks for weight
  and waist only; neck is behind a disclosure because it changes rarely.
- Units are fixed to the owner's preference: **pounds for weight, centimetres
  for waist, neck and height.** Not configurable.
- Unlock is a 4-digit code verified by a Cloudflare Pages Function that holds the
  account credentials as server secrets and returns a Supabase session. There is
  no password screen and no email field.
- Every read is still governed by Supabase row-level security.
- Signups are disabled at the project level: the publishable key is public.
- Terminology, used consistently: **mission** (the 84,000 kcal target),
  **complete day** (both sides present), **morning mission** (7,000 steps before
  09:00), **adjusted** vs **raw**.

## Brand Commitments

Name: **Manu Fitness**, wordmark "MISSION". Voice is plain and factual, never
congratulatory or coaching. No exclamation marks, no streak-shaming, no
motivational copy. The app reports; the owner decides.

Hard style rule carried from the owner's other work: **no em dashes anywhere.**

## Evidence on Hand

Real data only. Fourteen days of Garmin history, seven classified activities,
live MyFitnessPal macros, two body measurements. Demo data exists behind an
explicit `seeded` flag and is banner-warned when present.

At the time of writing the mission stands at roughly **0.2% of 84,000**, with 2
complete days and 12 incomplete. Nothing in the UI may fabricate a rosier
picture, invent a projection from too few days, or imply progress that the data
does not support. The projection is suppressed entirely below three complete
days and beyond a two-year horizon.

## Product Principles

1. **Never launder an assumption into a fact.** Show the factor, show the raw
   number, label the provenance.
2. **An incomplete day is worth zero, and says so.** Silence about missing data
   is the one failure mode that makes the whole total a lie.
3. **Raw in the database, derived at read time.** Any stored aggregate is a bug.
4. **Silent failure must be impossible.** A sync that stops, a watch that has not
   uploaded, a cached snapshot being shown: each is stated on screen.
5. **It is a glanceable instrument, not a destination.** Optimise for the
   four-second check, not the long session.

## Accessibility & Inclusion

Self-imposed and enforced by measurement, not by palette claim: text under 24px
holds **7:1**, large text 4.5:1, chart axes 4.6:1, non-text graphics 3:1. Both
palettes. Verified by walking the rendered DOM, currently 768 nodes with zero
failures.

Also honored: `prefers-reduced-motion`, `prefers-reduced-transparency`, visible
focus on every interactive element, a skip link, 44px minimum touch targets, and
one spoken sentence per card so a screen reader gets state rather than orphaned
numbers.
