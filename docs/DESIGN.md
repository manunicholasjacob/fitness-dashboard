# Design system

Two things in here are load-bearing and easy to break by accident: the contrast
tiers and the elevation scale. Everything else is preference.

## Contrast is solved, not eyeballed

Every colour is a token in `web/src/index.css`. Nothing is hard-coded in a
component, which is what makes light mode a token swap rather than a rewrite.

The thresholds scale with type size, because that is how legibility actually
works:

| Kind | Threshold |
| --- | --- |
| Text under 24px, or under 18.66px bold | **7:1** |
| Text 24px and up, or 18.66px and up bold | **4.5:1** |
| Chart axes and placeholder text | 4.6:1 |
| Non-text graphics: borders, rules, series | 3:1 |

Each foreground was solved numerically against **the darkest surface it sits
on**, not against white. Solving against white leaves tones failing by a tenth
of a point on the nav and on tinted banners, which is exactly the sort of near
miss that never gets noticed.

### Why some meanings have more than one colour

A colour that reads well as a 72px figure is not necessarily dark enough to
carry an 11px label, and forcing one value to do both drains the display type
without helping the label much. So each semantic meaning has up to three tokens:

- `--color-accent` and friends: the vivid base. Display figures, chart series,
  dots, rules, and fills that carry no text.
- `--color-accent-text`: solved to 7:1. **The default for any text.**
- `--color-accent-fill`: solved so `--color-on-accent` clears 7:1 on top of it.
  Buttons, active pills, the skip link.

In dark mode these are usually the same value, because the base already clears
7:1 there. The names exist in both modes so components never have to branch.

`--color-faint` is the one token deliberately below 7:1. Solving it to 7:1 lands
it exactly on `--color-muted`, which would leave the palette with two identical
greys and no dim tier at all, so it is restricted to borders and never carries
text.

### Verifying it

Contrast is checked by measuring the rendered page, not by trusting the palette.
That distinction matters: the palette claimed 7:1 while light mode's accent,
warn and danger actually sat at about 5:1 on small text.

Build locally with `VITE_PWA_DISABLE=1` when reviewing changes, or the service
worker keeps serving the previous bundle and an edit appears not to have taken
when it has. Production builds keep the worker.

Open the deployed site, unlock it, and paste `docs/contrast-audit.js` into the
console. It walks every visible text node, resolves colours through a canvas so
`oklab()` and alpha compositing come out right, and reports any node under its
threshold. It should print zero failures on every page in both palettes.

Two traps it exists to avoid:

- **`getComputedStyle` does not normalise `oklab()`.** Tailwind v4 emits oklab
  for opacity modifiers like `bg-[var(--color-ink)]/80`. Parsing that string as
  RGB reads the lightness as a red channel and reports a false failure.
- **A theme switch takes a moment to settle.** Measuring mid-switch can return
  one token from each palette, which is impossible in a settled state. Reload
  after changing the emulated scheme.

## Elevation and shape

Cards are not all the same weight. `Card` takes a `tone`:

- `quiet` groups content and casts no shadow
- `raised` is the default
- `hero` is reserved for the mission figure

If everything is elevated then nothing is, so the tone is a choice per card.
Shadows carry the hue of the ground they fall on rather than neutral black,
which is the difference between a card sitting on the page and a card pasted
over it.

The radius scale steps down as you nest: hero 24, card 18, control 12, inner 10,
chips pill. A single radius everywhere is what makes an interface read as a
stack of identical rectangles.

## Typography

- **Headings are sentence case.** Small caps is a data-label treatment. Using it
  for headings too is how seventeen shouting labels ended up on one screen.
- **`.eyebrow`** is the small-caps micro-label. It belongs directly above a
  value, or on a table column header. Nowhere else.
- **`.display`** tightens tracking and line-height for large figures. The
  letter-spacing that keeps 13px legible is far too loose at 72px.
- **`.tnum`** for any number that changes, so it does not jitter as it updates.

## Motion

`MOTION_INTENSITY` here is deliberately low. This is a dashboard opened many
times a day, and a reveal that is charming on a first visit becomes a tax on the
two hundredth. So `.rise` moves 10px over 460ms, once per mount, using transform
and opacity only. No blur, no scale, nothing that reads as a page performing for
you.

The stagger stops at six steps (`.rise-1` to `.rise-6`). Past the visible fold a
longer delay would outlast the scroll and content would read as missing, so
everything below rides the last step.

The reduced-motion block zeroes `animation-delay` as well as the duration.
Without that a staggered entry still holds its `from` state through the delay,
so content blinks in rather than simply being there.

## What was tried and reverted

Both design skills default to a marketing-page posture. Two of their patterns
were built, looked at, and removed, because in a data view they read as chrome
rather than craft:

- **A pill badge around the hero eyebrow.** Against a near-white hero the badge
  either disappears or has to be darkened until the label outweighs the number
  it is labelling.
- **A nested tray around the mission progress bar.** The bar already has its own
  inset channel; a tray around it is one enclosure too many and at that size
  reads as a gap rather than as an object.

The nested-enclosure idea was kept where there is a real container to enclose:
the keypad tray, and the navigation islands.

## Failure is a designed state

Three of the worst defects found in review were not ugly, they were confident:

- **A failed load painted a healthy empty dashboard.** `error` was set on every
  fetch failure and read by nothing, so a dead connection produced "No data for
  today yet" and a hero reading 0.0% of 84,000. Unknown is not zero, and the one
  number this product exists to carry is the one it must never guess at. There
  is an error banner now, and the hero renders `--` when the load failed with
  nothing cached.
- **A stale chunk produced a white screen.** Every route except the dashboard is
  lazy, and this is a PWA: a phone can hold an index.html from last week naming
  chunks a new deploy has renamed. That is not an exotic failure, it is the
  ordinary consequence of shipping an update. `ErrorBoundary` recognises the
  chunk-load errors specifically, says a newer version is available, and clears
  the service worker on the way to reloading.
- **`/display` had no exit.** Zero anchors, outside the layout, installed to a
  home screen with no back button. A kiosk is a mode, and a mode needs a door.

## Touch targets are a floor, not an aspiration

`Button` and `inputClass` carry `min-h-11`, but bare `<button className="text-xs">`
bypasses both, and that is where every violation was: a 36x16 Delete with no
confirm, a 22px-tall row select that was invisible until hover and wrote to the
database on change, chip rows at 36px. `.tap` and `.tap-inline` exist for the
cases where padding to 44px would loosen the row: the hit area grows, the visual
box does not.

## Things that are deliberate

- **No in-app theme switch.** The app follows the system appearance. An
  app-specific setting means two places to change one preference, and reads as a
  bug when the app ignores the system.
- **A progress bar at 0.2% draws a visible sliver rather than an empty trough.**
  The exact figure is stated in text beside every bar and in `aria-valuenow`, so
  the rounding is presentational and never the only source of the number.
- **Navigation floats rather than meeting a viewport edge.** An edge-to-edge bar
  reads as browser chrome. Detached, with the page scrolling visibly underneath,
  it reads as part of the app, and on a phone it stops competing with the home
  indicator for the same strip of glass.
- **Axis ticks follow the domain the axis actually draws.** A `ReferenceLine`
  does not extend the domain, so it must not influence tick formatting. Letting
  it do so rendered five identical "0k" labels on a new mission.
