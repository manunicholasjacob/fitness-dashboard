# Setup

> **This is already provisioned and running.** Keep this document as the
> reference for rebuilding it, or for standing it up somewhere else.
>
> - **Site:** https://fitness-dashboard-emv.pages.dev/
> - **Supabase project:** `qzapbvrcdnxvhserporn`
> - **Sign in with:** the email and password recorded in `sync/.env`
> - **Daily sync:** Windows scheduled task `Fitness Dashboard Sync`, 21:00
>
> Run `npm run sync:doctor` at any time to check every link in the chain.

Roughly 20 minutes end to end. You can stop after Part 1 and have a working dashboard with manual entry.

---

## Part 0: Try it first, no backend needed

```bash
npm run install:web
echo VITE_DEMO_MODE=1 > web/.env.local
npm run dev
```

Open http://localhost:5173. You are signed straight in with 45 days of generated data, clearly banner-labelled as demo, stored only in this browser.

Delete `web/.env.local` when you are ready to use the real thing.

---

## Part 1: Supabase

### 1.1 Create the project

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project**. Name it anything. Choose the region nearest you.
3. Save the database password it generates somewhere safe. You will not need it for this app, but losing it is annoying.
4. Wait about two minutes for provisioning.

### 1.2 Run the schema

1. In the project, open **SQL Editor** in the left sidebar.
2. **New query**.
3. Paste the entire contents of `supabase/migrations/0001_init.sql`.
4. **Run**.

You should see `Success. No rows returned`. This creates five tables, row-level security policies on all of them, and a trigger that gives any new account a settings row.

### 1.3 Create your account

1. **Authentication** in the sidebar, then **Users**.
2. **Add user**, then **Create new user**.
3. Enter your email and a password. **Tick "Auto Confirm User"** so you do not have to click a confirmation email.
4. Create.

> Consider turning off new signups so nobody else can create an account against your project: **Authentication** then **Sign In / Providers**, and disable **Allow new users to sign up**. Your account already exists, so this costs you nothing.

### 1.4 Copy your keys

**Project Settings** then **API**. You need two values:

- **Project URL**, like `https://abcdefghij.supabase.co`
- **anon public** key, a long JWT

The anon key is safe to publish. It is a public identifier, and the row-level security policies from step 1.2 are what actually protect your data.

### 1.5 Point the app at it

```bash
cp web/.env.example web/.env
```

Edit `web/.env`:

```
VITE_SUPABASE_URL=https://abcdefghij.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_BASE_PATH=/fitness-dashboard/
```

Then:

```bash
npm run dev
```

Sign in with the email and password from step 1.3.

### 1.6 Seed the baseline (optional)

The signup trigger already applied the correct defaults. If you want to reset to the starting baseline later, or record the starting measurements as your first check-in, run `supabase/seed.sql` in the SQL Editor.

**At this point the dashboard is fully usable.** You can log weight and waist in seconds, enter nutrition manually, import CSVs, and watch the mission accumulate. Everything below is automation.

---

## Part 2: The sync agent

Full detail in [SYNC-AGENT.md](SYNC-AGENT.md). The short path:

```bash
npm run install:sync
cp sync/.env.example sync/.env
```

Fill in `sync/.env`:

```
SUPABASE_URL=https://abcdefghij.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
APP_EMAIL=you@example.com
APP_PASSWORD=the-password-from-step-1.3
GARMIN_EMAIL=you@example.com
GARMIN_PASSWORD=your-garmin-password
MFP_USERNAME=your-mfp-username
MFP_DIARY_KEY=your-diary-sharing-key
TIMEZONE=America/Chicago
```

Two one-time provider steps, both covered in [SYNC-AGENT.md](SYNC-AGENT.md):

- **Garmin:** if you sign in with Google, set a Garmin password via "Forgot
  password" first. The library uses Garmin's own SSO, not Google's.
- **MyFitnessPal:** set Settings > Diary Settings > Diary Sharing to "Locked
  with a Key". No MyFitnessPal login is involved at any point.

`sync/.env` is gitignored and never leaves your laptop.

```bash
npm run sync:doctor    # check every link in the chain first
npm run sync:garmin    # should pull the last 3 days
npm run sync:mfp       # should pull the last 3 days of diary totals
npm run sync:status    # confirm both succeeded
```

Then schedule it daily. On Windows:

```powershell
schtasks /create /tn "Fitness Dashboard Sync" /tr "C:\path\to\fitness-dashboard\sync\run_daily.cmd" /sc daily /st 21:00 /f
```

---

## Part 3: Deploy

### 3.1 Push the repository

```bash
git init
git add .
git commit -m "Energy deficit mission control"
git branch -M main
git remote add origin https://github.com/YOURNAME/fitness-dashboard.git
git push -u origin main
```

The repository can be public. It holds no secrets: `web/.env` and `sync/.env` are gitignored, and your health data lives in Supabase behind a login, not in the repo.

### 3.2 Why Cloudflare Pages rather than GitHub Pages

GitHub Pages project sites inherit the custom domain configured on the account's *user* site, and there is no way to opt one project out. That put this dashboard on a path under a personal professional domain. Cloudflare Pages gives it its own origin.

### 3.3 Create the Cloudflare project

1. In Cloudflare, create an **API token** with exactly one permission: **Account > Cloudflare Pages > Edit**. Not the broader Workers template.
2. Create a Pages project named `fitness-dashboard`.

### 3.4 Add the repository secrets

**Settings > Secrets and variables > Actions**, four secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 3.5 Deploy

Push to `main`. The workflow typechecks, runs the tests, builds, refuses to publish a bundle that is not actually configured or whose asset paths are not root-relative, and deploys.

Your dashboard is at https://fitness-dashboard-emv.pages.dev/

`_headers` sets the security headers and caching policy; `_redirects` serves the shell for any deep path; `robots.txt` and a `noindex` meta keep it out of search results.

---

## Part 4: Install on your iPhone

1. Open the site in **Safari**. It has to be Safari; Chrome on iOS cannot install PWAs.
2. Tap the **Share** button.
3. **Add to Home Screen**.
4. Open it from the home screen. It runs full-screen with no browser chrome.
5. Sign in once. The session persists indefinitely, so you will not be asked again on that device.

---

## Part 5: The wall display

Point any tablet, monitor, or Raspberry Pi browser at:

```
https://fitness-dashboard-emv.pages.dev/#/display
```

Sign in once on that device. The page is non-interactive, uses oversized type, and refreshes itself every 15 minutes. For a Raspberry Pi kiosk:

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  "https://fitness-dashboard-emv.pages.dev/#/display"
```

---

## Troubleshooting

**"Supabase is not configured" on the login screen**
`web/.env` is missing or not being read. Vite only reads it at startup, so restart the dev server after creating it. Variables must start with `VITE_`.

**Sign-in returns "Invalid login credentials"**
The user was created without **Auto Confirm User** ticked. In Supabase, Authentication then Users, open the user and confirm the email, or delete and recreate with the box ticked.

**Login works but every page is empty**
Row-level security is doing its job but no data exists yet. Either sync, or load demo data from Settings.

**"No settings row exists for this account"**
The signup trigger did not fire, usually because the account was created before the migration ran. Run this in the SQL Editor:
```sql
insert into public.app_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;
```

**The deployed site is a blank page**
Almost always the base path. Cloudflare Pages serves from `/`, so the build sets `VITE_BASE_PATH=/`. Note that Git Bash rewrites a bare `/` into a Windows path, so use `MSYS_NO_PATHCONV=1` when building by hand there. The publish guard fails the build if asset paths are not root-relative.
Almost always the base path. Check that the Pages URL matches your repository name. The workflow sets it automatically; if you build locally, set `VITE_BASE_PATH` yourself.

**Deploy fails on "Guard against publishing an unconfigured build"**
The repository secrets from step 3.2 are missing or misspelled. That guard exists so you do not ship a bundle that silently cannot reach your database.
