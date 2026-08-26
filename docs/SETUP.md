# Setup

> **This is already provisioned.** The deployment, the Supabase project, the
> schema and the account all exist. Keep this document as the reference for
> rebuilding it, or for standing it up somewhere else.
>
> - **Site:** https://manunicholasjacob.com/fitness-dashboard/
> - **Supabase project:** `qzapbvrcdnxvhserporn`
> - **Sign in with:** the email and password recorded in `sync/.env`
>
> What remains are the two provider logins covered in
> [SYNC-AGENT.md](SYNC-AGENT.md): setting a Garmin password, and one
> MyFitnessPal browser sign-in. Run `npm run sync:doctor` at any time to see
> exactly what is still outstanding.

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
TIMEZONE=America/Chicago
```

`sync/.env` is gitignored and never leaves your laptop.

```bash
npm run sync:doctor    # check every link in the chain first
npm run sync:garmin    # should pull the last 3 days
npm run sync:login     # opens a browser: sign in to MyFitnessPal once
npm run sync:mfp       # should pull the last 3 days of diary totals
npm run sync:status    # confirm both succeeded
```

Then schedule it daily. On Windows:

```powershell
schtasks /create /tn "Fitness Sync" /tr "cmd /c cd /d C:\path\to\fitness-dashboard && npm run sync" /sc daily /st 21:00
```

---

## Part 3: Deploy to GitHub Pages

### 3.1 Push the repository

```bash
git init
git add .
git commit -m "Energy deficit mission control"
git branch -M main
git remote add origin https://github.com/YOURNAME/fitness-dashboard.git
git push -u origin main
```

The repository can be public. It contains no secrets: `web/.env` and `sync/.env` are gitignored, and your health data lives in Supabase behind a login, not in the repo.

> If you name the repository something other than `fitness-dashboard`, no change is needed. The workflow derives the base path from the repository name automatically.

### 3.2 Add the build secrets

**Settings** then **Secrets and variables** then **Actions**. Add two repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are the same two values from step 1.4.

### 3.3 Enable Pages

**Settings** then **Pages**. Under **Source**, choose **GitHub Actions**.

### 3.4 Deploy

Push to `main`, or run the workflow manually from the **Actions** tab. It typechecks, runs the tests, builds, verifies the bundle actually contains your Supabase URL, and publishes.

Your dashboard is at https://manunicholasjacob.com/fitness-dashboard/

> Note: because the account-level GitHub Pages custom domain is set on the
> user site, project pages inherit it. `manunicholasjacob.github.io/fitness-dashboard/`
> permanently redirects there. To host it off that domain instead, connect the
> same repository to Cloudflare Pages, which serves it at a `*.pages.dev`
> address. A `robots.txt` and a `noindex` meta keep it out of search results
> either way.

---

## Part 4: Install on your iPhone

1. Open the Pages URL in **Safari**. It has to be Safari; Chrome on iOS cannot install PWAs.
2. Tap the **Share** button.
3. **Add to Home Screen**.
4. Open it from the home screen. It runs full-screen with no browser chrome.
5. Sign in once. The session persists indefinitely, so you will not be asked again on that device.

---

## Part 5: The wall display

Point any tablet, monitor, or Raspberry Pi browser at:

```
https://manunicholasjacob.com/fitness-dashboard/#/display
```

Sign in once on that device. The page is non-interactive, uses oversized type, and refreshes itself every 15 minutes. For a Raspberry Pi kiosk:

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  "https://manunicholasjacob.com/fitness-dashboard/#/display"
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
Almost always the base path. Check that the Pages URL matches your repository name. The workflow sets it automatically; if you build locally, set `VITE_BASE_PATH` yourself.

**Deploy fails on "Guard against publishing an unconfigured build"**
The repository secrets from step 3.2 are missing or misspelled. That guard exists so you do not ship a bundle that silently cannot reach your database.
