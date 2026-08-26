-- Seed the baseline profile.
--
-- Run this ONCE, after creating your account in the Supabase dashboard and
-- signing in to the web app for the first time. The signup trigger in
-- 0001_init.sql already inserts a settings row with these same defaults, so
-- this script exists mainly to reset the profile back to the starting baseline
-- or to correct it after experimenting.
--
-- It targets the single existing user, so it is safe to run as-is.

update public.app_settings
set
  display_name              = 'Manu',
  sex                       = 'male',
  height_cm                 = 170,
  timezone                  = 'America/Chicago',

  start_date                = current_date,
  -- 170 lb and 150 lb expressed in kilograms.
  starting_weight_kg        = 77.11070,
  target_weight_kg          = 68.03886,
  starting_body_fat_percent = 20,
  target_body_fat_min       = 10,
  target_body_fat_max       = 12,

  -- 20 lb x 3,500 kcal/lb x 1.20 buffer = 84,000 kcal.
  calories_per_pound        = 3500,
  mission_buffer_percent    = 20,
  mission_target_override   = null,

  garmin_adjustment_factor  = 0.85,
  intake_adjustment_factor  = 1.10,

  morning_step_goal         = 7000,
  morning_deadline          = '09:00',

  protein_target            = 150,
  carbs_target              = null,
  fat_target                = null,
  fiber_target              = 30,

  -- Pounds for weight, centimetres for every circumference.
  units                     = 'imperial',
  length_units              = 'metric',
  starting_waist_cm         = 87,
  starting_neck_cm          = 40
where user_id = (select id from auth.users order by created_at limit 1);

-- Record the starting measurements as the first check-in, so the weight and
-- waist charts have an anchor point from day one.
insert into public.body_entries (user_id, date, weight_kg, waist_cm, neck_cm, source, notes)
select
  id,
  current_date,
  77.11070,
  87,
  40,
  'manual',
  'Starting baseline'
from auth.users
order by created_at
limit 1
on conflict (user_id, date) do nothing;

-- Confirm what landed.
select
  display_name,
  round(starting_weight_kg * 2.2046226218) as starting_lb,
  round(target_weight_kg * 2.2046226218)   as target_lb,
  round(
    (starting_weight_kg - target_weight_kg) * 2.2046226218
    * calories_per_pound
    * (1 + mission_buffer_percent / 100.0)
  ) as mission_target_kcal,
  garmin_adjustment_factor,
  intake_adjustment_factor,
  morning_step_goal,
  morning_deadline
from public.app_settings;
