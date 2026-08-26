-- Energy Deficit Mission Control: initial schema.
--
-- Design rule that everything else follows: these tables store RAW source data
-- only. There is no adjusted_expenditure column, no daily_deficit column, and
-- no cumulative total. Every adjusted figure is derived in the app from the
-- current settings, which is what makes "change the correction factor without
-- rewriting history" true by construction rather than by careful bookkeeping.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Settings: exactly one row per user.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,

  display_name text        not null default 'Manu',
  sex text                 not null default 'male' check (sex in ('male', 'female')),
  height_cm numeric        not null default 170 check (height_cm > 0),
  timezone text            not null default 'America/Chicago',

  start_date date          not null default current_date,
  starting_weight_kg numeric not null default 77.1107 check (starting_weight_kg > 0),
  target_weight_kg numeric   not null default 68.0389 check (target_weight_kg > 0),
  starting_body_fat_percent numeric not null default 20,
  target_body_fat_min numeric not null default 10,
  target_body_fat_max numeric not null default 12,
  calories_per_pound numeric  not null default 3500 check (calories_per_pound > 0),
  mission_buffer_percent numeric not null default 20 check (mission_buffer_percent >= 0),
  mission_target_override numeric check (mission_target_override > 0),

  -- Bounded so a fat-fingered entry cannot silently distort the whole mission.
  garmin_adjustment_factor numeric not null default 0.85
    check (garmin_adjustment_factor between 0.3 and 1.5),
  intake_adjustment_factor numeric not null default 1.10
    check (intake_adjustment_factor between 0.5 and 2.0),

  morning_step_goal integer not null default 7000 check (morning_step_goal > 0),
  morning_deadline time     not null default '09:00',

  protein_target numeric,
  carbs_target numeric,
  fat_target numeric,
  fiber_target numeric,

  units text not null default 'imperial' check (units in ('imperial', 'metric')),
  -- Circumferences are tracked in cm even when weight is in pounds.
  length_units text not null default 'metric' check (length_units in ('imperial', 'metric')),
  starting_waist_cm numeric not null default 87,
  starting_neck_cm numeric  not null default 40,

  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Daily metrics: one row per calendar date, raw values only.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,

  -- Raw Garmin energy
  raw_garmin_total_calories   numeric check (raw_garmin_total_calories >= 0),
  raw_garmin_active_calories  numeric check (raw_garmin_active_calories >= 0),
  raw_garmin_resting_calories numeric check (raw_garmin_resting_calories >= 0),

  -- Raw MyFitnessPal nutrition
  raw_mfp_calories numeric check (raw_mfp_calories >= 0),
  protein numeric, carbs numeric, fat numeric,
  fiber numeric, sugar numeric, sodium numeric,

  -- Raw Garmin activity
  steps_total integer check (steps_total >= 0),
  steps_before_deadline integer check (steps_before_deadline >= 0),
  morning_goal_met_at timestamptz,
  distance_meters numeric,
  active_minutes numeric,
  intensity_minutes numeric,
  floors_climbed numeric,

  -- Raw Garmin health
  average_hr numeric, resting_hr numeric, max_hr numeric,
  sleep_seconds numeric, sleep_deep_seconds numeric, sleep_rem_seconds numeric,
  sleep_score numeric, stress_avg numeric,
  body_battery_high numeric, body_battery_low numeric,
  spo2_avg numeric, respiration_avg numeric,

  energy_source text check (energy_source in ('garmin','mfp','manual','import','demo')),
  nutrition_source text check (nutrition_source in ('garmin','mfp','manual','import','demo')),
  is_demo boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The sync agent upserts on this key, which is what makes re-running it safe.
  unique (user_id, date)
);

create index if not exists daily_metrics_user_date_idx
  on public.daily_metrics (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Body check-ins: weight, waist, neck, hips. All optional, any day.
-- ---------------------------------------------------------------------------
create table if not exists public.body_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,

  weight_kg numeric check (weight_kg > 0 and weight_kg < 500),
  waist_cm  numeric check (waist_cm > 0 and waist_cm < 300),
  neck_cm   numeric check (neck_cm > 0 and neck_cm < 100),
  hip_cm    numeric check (hip_cm > 0 and hip_cm < 300),
  planning_body_fat_override numeric check (planning_body_fat_override between 1 and 70),
  notes text,
  source text not null default 'manual'
    check (source in ('garmin','mfp','manual','import','demo')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, date)
);

create index if not exists body_entries_user_date_idx
  on public.body_entries (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Activities.
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  external_source text not null default 'garmin'
    check (external_source in ('garmin','mfp','manual','import','demo')),
  external_id text,
  activity_type text not null default 'other'
    check (activity_type in
      ('running','walking','cycling','swimming','strength','climbing','hiking','cardio','other')),
  raw_activity_type text,

  start_time timestamptz not null,
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  distance_meters numeric,
  calories numeric,
  average_hr numeric, max_hr numeric,
  average_speed_mps numeric,
  cadence numeric,
  running_power numeric,
  elevation_gain_meters numeric,
  training_load numeric,
  aerobic_training_effect numeric,
  notes text,
  raw_payload jsonb,

  created_at timestamptz not null default now(),

  -- Deduplicates re-syncs of the same Garmin activity.
  unique (user_id, external_source, external_id)
);

create index if not exists activities_user_start_idx
  on public.activities (user_id, start_time desc);
create index if not exists activities_user_type_idx
  on public.activities (user_id, activity_type);

-- ---------------------------------------------------------------------------
-- Sync bookkeeping. Drives the "MFP has not synced in 2 days" warning.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('garmin','mfp')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running','success','partial','failed')),
  records_imported integer not null default 0,
  error_message text
);

create index if not exists sync_logs_user_provider_idx
  on public.sync_logs (user_id, provider, started_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security. One user, but the tables are behind a public URL, so
-- every row is scoped to its owner and nothing is readable while signed out.
-- ---------------------------------------------------------------------------
alter table public.app_settings  enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.body_entries  enable row level security;
alter table public.activities    enable row level security;
alter table public.sync_logs     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['app_settings','daily_metrics','body_entries','activities','sync_logs']
  loop
    execute format('drop policy if exists own_rows_select on public.%I', t);
    execute format('drop policy if exists own_rows_insert on public.%I', t);
    execute format('drop policy if exists own_rows_update on public.%I', t);
    execute format('drop policy if exists own_rows_delete on public.%I', t);

    execute format(
      'create policy own_rows_select on public.%I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy own_rows_insert on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy own_rows_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy own_rows_delete on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Keep updated_at honest.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists touch_app_settings  on public.app_settings;
drop trigger if exists touch_daily_metrics on public.daily_metrics;
drop trigger if exists touch_body_entries  on public.body_entries;

create trigger touch_app_settings  before update on public.app_settings
  for each row execute function public.touch_updated_at();
create trigger touch_daily_metrics before update on public.daily_metrics
  for each row execute function public.touch_updated_at();
create trigger touch_body_entries  before update on public.body_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Give every new account a settings row, so the app never faces a null profile.
-- ---------------------------------------------------------------------------
create or replace function public.seed_settings_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_settings_for_new_user();
