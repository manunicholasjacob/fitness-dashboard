# The sync agent

A Python program that runs on your laptop once a day, pulls from Garmin and MyFitnessPal, normalises the data, and writes it to Supabase.

---

## Why it exists

This is worth stating plainly, because the alternative gets promised a lot and does not exist.

**Garmin.** The Connect Developer Program requires applicants to be a legal entity (company, university, hospital, research institution). Personal-use applications are rejected as a matter of policy, and the program is currently suspended for new applicants entirely. There is no queue for an individual to join.

**MyFitnessPal.** The public API was deprecated in 2019. Access is private-partner only and the developer program is closed to new applicants.

So there is no OAuth integration to build. What remains is what the agent does: authenticate the way you do, and read your own data.

---

## What it collects

### Garmin (via `garminconnect`)

The library performs the same mobile SSO login the official Garmin app uses and caches the resulting tokens in `sync/.garmin-tokens/`, so a full login happens once rather than daily.

**Daily:** total, active and resting calories; total steps; steps before your morning deadline; distance; active and intensity minutes; floors; average, resting and max heart rate; sleep duration with deep and REM breakdown and sleep score; average stress; body battery high and low; SpO2; respiration.

**Per activity:** type, start time, duration, distance, calories, average and max heart rate, average speed, cadence, running power, elevation gain, training load, aerobic training effect.

Activity types are mapped onto the app's categories (running, walking, cycling, swimming, strength, climbing, hiking, cardio, other). Anything mapped wrong can be corrected in a dropdown on the Activity page, and the correction sticks.

#### How "steps before 9am" is computed

Garmin exposes intraday step buckets in 15-minute intervals, timestamped in UTC. The agent converts each bucket into your configured timezone and sums those ending at or before the deadline. This is a real measurement, not an estimate.

### MyFitnessPal (via Playwright)

Calories, protein, carbohydrates, fat, fibre, sugar, and sodium, taken from the day's totals row.

It reads `myfitnesspal.com/reports/printable_diary/...`, which is a plain server-rendered table built for printing. That page changes far less often than the React app, and the extractor matches columns by header name rather than position, so a reordered or added column does not break it.

The parser is verified against both diary layouts MyFitnessPal uses; see `sync/tests/README.md`.

---

## The MyFitnessPal session model

This is the part worth understanding, because it explains a design choice that looks odd at first.

The common approach is `browser_cookie3`, which reads MyFitnessPal's cookie out of your installed browser's cookie store. **On Windows this no longer works with Chrome.** Since Chrome 127, cookies are protected by app-bound encryption, and the only ways around it are the techniques credential stealers use. This agent does not do that.

Instead, Playwright runs its own Chromium against a persistent profile directory at `sync/.mfp-profile/`:

1. `npm run sync:login` opens a **visible** window at the MyFitnessPal login page.
2. You sign in by hand, clearing any captcha or two-factor prompt.
3. The session cookie lands in that profile directory.
4. Every run after that launches **headless** against the same profile and is already signed in.

No password is stored by the agent. Nothing decrypts another application's data. Your day-to-day browser is untouched, and you can keep using Chrome normally.

> `sync/.mfp-profile/` holds a live login session. It is gitignored, and you should treat it the way you would treat a saved password.

---

## Running it

```bash
npm run sync           # both providers
npm run sync:garmin    # Garmin only
npm run sync:mfp       # MyFitnessPal only
npm run sync:login     # one-time MyFitnessPal sign-in
npm run sync:status    # recent run history
```

Useful flags:

```bash
python sync/run_sync.py all --days 14     # backfill two weeks
python sync/run_sync.py mfp --verbose     # debug logging
```

Or set `HEADLESS=0` in `sync/.env` to watch the browser drive MyFitnessPal, which is the fastest way to see what went wrong.

### Backfill window

`BACKFILL_DAYS` defaults to 3. Every run re-syncs the last three days, which covers a weekend outage and picks up food you logged late at night. Re-running is always safe: writes upsert on `(user_id, date)` and on the Garmin activity id, so nothing duplicates.

---

## Scheduling

### Windows

```powershell
schtasks /create /tn "Fitness Sync" ^
  /tr "cmd /c cd /d C:\path\to\fitness-dashboard && npm run sync" ^
  /sc daily /st 21:00
```

Evening works better than morning: your food log is complete by then, whereas at 7am the previous day may still be missing dinner. The three-day backfill window means the morning's Garmin data still arrives the following evening.

Check it ran: `schtasks /query /tn "Fitness Sync"`

### macOS or Linux

```cron
0 21 * * * cd /path/to/fitness-dashboard && /usr/bin/npm run sync >> /tmp/fitness-sync.log 2>&1
```

---

## Failure behaviour

Each provider runs independently. Garmin failing does not stop MyFitnessPal, because a half-synced day beats no day.

Every run writes a `sync_logs` row: start time, end time, status, records written, and the error if any. That drives:

- a warning banner across the app after two days without a successful sync
- the per-provider status and error text on the Integrations page
- `npm run sync:status`

A failed scrape can never quietly become a missing day that looks like a rest day.

**A note on `partial` status:** if MyFitnessPal returns no diary entries at all for every day in the window, the run is recorded as `partial` rather than `success`. An empty diary is legitimate, but an entirely empty window usually means something is broken rather than that you did not eat.

---

## Security posture

The agent authenticates as your ordinary application user and writes through PostgREST, governed by exactly the same row-level security as the website.

It deliberately does **not** use the Supabase service-role key. An unattended job on a laptop is the last place a key that bypasses RLS should live. The worst case if `sync/.env` leaks is the same as your dashboard password leaking, rather than full database access.

Files that must never be committed (all gitignored):

| Path | Contains |
| --- | --- |
| `sync/.env` | Supabase, dashboard and Garmin credentials |
| `sync/.mfp-profile/` | A live MyFitnessPal session |
| `sync/.garmin-tokens/` | Garmin OAuth tokens |

---

## Troubleshooting

**"garminconnect is not installed"**
`npm run install:sync`

**Garmin login fails with a multi-factor prompt**
Run `python sync/run_sync.py garmin --verbose` from a terminal you can type into. The library prompts for the one-time code, and the resulting token is cached, so this is once rather than daily.

**Garmin sync suddenly stops working**
Garmin changed something on their side. The library is actively maintained and these breakages are typically fixed within days: `pip install --upgrade garminconnect`.

**"The saved MyFitnessPal session has expired"**
Exactly what it says. `npm run sync:login` again. Expect this every few months.

**"Could not determine your MyFitnessPal username"**
Set it explicitly in `sync/.env`. It is the last part of your profile URL, `myfitnesspal.com/profile/YOUR_USERNAME`.

**MyFitnessPal returns zero calories for days you definitely logged**
Your diary is probably private, which the printable view respects. Set the diary to public, or to "shared with friends only", under MyFitnessPal privacy settings. Run with `HEADLESS=0` to see the page the agent is actually getting.

**"No settings row exists for this account"**
Sign in to the web app once first. The row is created on first signup by a database trigger.

**Steps before the deadline are always null**
`get_steps_data` did not return intraday buckets, usually because the watch had not synced to Garmin Connect yet when the agent ran. Move the schedule later, or accept it and let the next day's three-day backfill fill it in.
