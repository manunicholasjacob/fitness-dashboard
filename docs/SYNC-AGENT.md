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

**Four times a day, in the cloud.** The `Sync` GitHub Actions workflow runs at
10:00, 14:00, 18:00 and 21:00 US Central, and can be run on demand from the
Actions tab with a custom backfill window.

It runs in the cloud rather than on the laptop because it can: both providers
are plain HTTP now, so nothing needs a browser and nothing needs a machine that
happens to be awake. Runs are also visible and re-runnable, which a local task
is not.

Three things make the schedule safe to run this often:

- **A concurrency group.** A slow run and a scheduled one cannot overlap and
  race each other's upserts.
- **A cached Garmin session.** Garmin rate-limits logins aggressively and does
  so per account, so the token is carried between runs rather than signing in
  four times a day.
- **A single-instance lock in the agent.** Belt and braces, and it also covers
  the local path where a catch-up run can land on top of a scheduled one.

Every run re-fetches the last three days rather than only today, so a missed
window heals itself and late entries are picked up.

### A caveat about Garmin and cloud IPs

Garmin rate-limits by IP, and GitHub's runners use shared addresses. Login
attempts from them do get 429s. The client falls back through several
authentication strategies and has succeeded so far, and the cached token means
most runs never sign in at all, but this is the part of the setup most likely
to need attention one day. If it starts failing consistently, re-enable the
local task described below and the syncing moves back to a residential IP.

### The local task, kept as a fallback

A Windows scheduled task named `Fitness Dashboard Sync` exists with the same
four triggers, and is **disabled**. Running both would double Garmin's request
volume for no benefit.

```powershell
Enable-ScheduledTask  -TaskName "Fitness Dashboard Sync"   # fall back to local
Disable-ScheduledTask -TaskName "Fitness Dashboard Sync"   # back to cloud only
```

It is configured to catch up a run missed while the machine was asleep, rather
than skipping it, and never wakes the machine itself.

> Worth knowing if you rely on it: a scheduled task reporting `Last Result: 0`
> is not proof it ran. During setup the task returned 0 while never executing
> its action at all. Check the log at
> `%LOCALAPPDATA%\fitness-dashboard-sync\sync.log` for a timestamped entry, not
> the exit code.

Any run can also be forced by hand:

```bash
npm run sync              # last 3 days
python sync/run_sync.py all --days 14
```

## The dashboard and the Garmin app disagree

Usually neither is wrong. Garmin's servers only hold what the watch has
uploaded; the phone app talks to the watch directly over Bluetooth and is
therefore routinely ahead. If the watch last uploaded at 09:04 and it is now
14:00, the app shows five hours of activity that Garmin Connect's own API has
never seen, and the dashboard faithfully reports the older figure.

The sync records `wellnessEndTimeGmt` as `garmin_data_through`, and today's
activity card says which moment the numbers describe. Past 90 minutes it turns
to the warning tone and names the gap. Opening the Garmin Connect app on the
phone forces an upload; the next sync then agrees.

If the timestamp is current and the numbers still differ, that is a real
problem worth chasing.

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
