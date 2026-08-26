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

> If you sign in to Garmin with Google, set a Garmin password first at
> [connect.garmin.com/signin](https://connect.garmin.com/signin) via "Forgot
> password". The library talks to Garmin's own SSO, not Google's, so a
> Google-only account has no password for it to use. Google sign-in keeps
> working alongside it.


The library performs the same mobile SSO login the official Garmin app uses and caches the resulting tokens outside the repository, under `%LOCALAPPDATA%\fitness-dashboard-sync\garmin-tokens`, so a full login happens once rather than daily.

**Daily:** total, active and resting calories; total steps; steps before your morning deadline; distance; active and intensity minutes; floors; average, resting and max heart rate; sleep duration with deep and REM breakdown and sleep score; average stress; body battery high and low; SpO2; respiration.

**Per activity:** type, start time, duration, distance, calories, average and max heart rate, average speed, cadence, running power, elevation gain, training load, aerobic training effect.

Activity types are mapped onto the app's categories (running, walking, cycling, swimming, strength, climbing, hiking, cardio, other). Anything mapped wrong can be corrected in a dropdown on the Activity page, and the correction sticks.

#### How "steps before 9am" is computed

Garmin exposes intraday step buckets in 15-minute intervals, timestamped in UTC. The agent converts each bucket into your configured timezone and sums those ending at or before the deadline. This is a real measurement, not an estimate.

### MyFitnessPal (via diary sharing)

Calories, protein, carbohydrates, fat, fibre, sugar and sodium, per day.

**No browser and no login.** Three approaches were tried before this one:

- *Continue with Google* fails. Google refuses OAuth sign-in from automated
  browsers and says so: "This browser or app may not be secure."
- *Email and password* fails. The login form is behind a Cloudflare Turnstile
  bot check that fingerprints the browser environment, so it rejects the
  attempt no matter who types the password. Bot checks are not defeated here.
- *Scraping the printable diary HTML* fails. That page renders its table
  client-side, so a plain fetch returns an empty shell and every day looks
  unlogged.

What works is the feature MyFitnessPal built for exactly this purpose:
**Settings > Diary Settings > Diary Sharing > "Locked with a Key"**. The key is
a sharing key, not an account credential; it grants read access to the diary
and nothing else. The page fetches its data from a JSON endpoint, and the agent
calls that endpoint directly.

That is better than scraping would have been: structured figures rather than
parsed layout, one request for a whole date range, and nothing that expires.

#### Setting it up

1. In MyFitnessPal: **Settings > Diary Settings > Diary Sharing**
2. Choose **"Locked with a Key"** and set a key.
   "Public" also works but makes the diary readable by anyone with the URL.
3. In `sync/.env`, set `MFP_USERNAME` (the last part of your profile URL) and
   `MFP_DIARY_KEY`.

#### Servings, and why there are tests for it

Each diary entry carries two sets of figures: the food's, which are per serving
unit, and the entry's, which are what was actually eaten. Half a jar of sauce is
45 kcal at the entry level and 90 at the food level; 250 g of chicken is 500
against a per-gram 2.

The agent reads the entry-level figures. Reading the wrong ones would silently
double or halve intake, and intake feeds straight into the mission total, so
`sync/tests/test_mfp.py` pins the behaviour. Run it with `npm run test:sync`.

An unlogged day returns nothing rather than zero, so it stays *incomplete* and
contributes nothing to the mission, rather than counting as a free deficit.

---

## Running it

```bash
npm run sync           # both providers
npm run sync:garmin    # Garmin only
npm run sync:mfp       # MyFitnessPal only
npm run test:sync      # tests for the nutrition summariser
npm run sync:doctor    # check every link in the chain and say what to fix
npm run sync:status    # recent run history
```

**Start with `npm run sync:doctor`.** It verifies configuration, Supabase
sign-in, the settings row, write access through row-level security, Garmin
login and data availability, and the MyFitnessPal diary, and prints a
specific remedy under anything that fails.

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
schtasks /create /tn "Fitness Dashboard Sync" ^
  /tr "C:\path\to\fitness-dashboard\sync\run_daily.cmd" ^
  /sc daily /st 21:00 /f
```

Evening works better than morning: your food log is complete by then, whereas at 7am the previous day may still be missing dinner. The three-day backfill window means the morning's Garmin data still arrives the following evening.

Check it ran: `schtasks /query /tn "Fitness Sync"`

### macOS or Linux

```cron
0 21 * * * cd /path/to/fitness-dashboard && /usr/bin/python sync/run_sync.py all >> /tmp/fitness-sync.log 2>&1
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
| `%LOCALAPPDATA%\fitness-dashboard-sync\garmin-tokens` | Garmin OAuth tokens (outside the repo) |
| `%LOCALAPPDATA%\fitness-dashboard-sync\sync.log` | Daily run log |

MyFitnessPal keeps no local state at all: the diary key is read from `sync/.env` on each run and nothing is cached.

---

## Troubleshooting

**"garminconnect is not installed"**
`npm run install:sync`

**"spawn UNKNOWN" or "Could not launch a browser"**
The bundled Chromium needs a Visual C++ redistributable. Install Chrome or
Edge, which the agent prefers anyway, or install the Microsoft Visual C++
Redistributable and retry.

**Garmin rejects credentials that you are sure are right**
Your account is almost certainly federated through Google. See
[Signing in with Google](#signing-in-with-google) above.

**Garmin login fails with a multi-factor prompt**
Run `python sync/run_sync.py garmin --verbose` from a terminal you can type into. The library prompts for the one-time code, and the resulting token is cached, so this is once rather than daily.

**Garmin sync suddenly stops working**
Garmin changed something on their side. The library is actively maintained and these breakages are typically fixed within days: `pip install --upgrade garminconnect`.

**MyFitnessPal returns nothing for days you know you logged**
Check `MFP_DIARY_KEY` against Settings > Diary Settings > Diary Sharing, exactly as typed there. A wrong key is reported as such rather than as an empty diary.

**"Could not determine your MyFitnessPal username"**
Set it explicitly in `sync/.env`. It is the last part of your profile URL, `myfitnesspal.com/profile/YOUR_USERNAME`.

**MyFitnessPal returns zero calories for days you definitely logged**
Your diary is probably private, which the printable view respects. Set the diary to public, or to "shared with friends only", under MyFitnessPal privacy settings. Run with `HEADLESS=0` to see the page the agent is actually getting.

**"No settings row exists for this account"**
Sign in to the web app once first. The row is created on first signup by a database trigger.

**Steps before the deadline are always null**
`get_steps_data` did not return intraday buckets, usually because the watch had not synced to Garmin Connect yet when the agent ran. Move the schedule later, or accept it and let the next day's three-day backfill fill it in.
