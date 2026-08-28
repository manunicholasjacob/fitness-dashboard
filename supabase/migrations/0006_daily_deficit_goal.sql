-- The per-day deficit target the dashboard's suggestions aim at.
--
-- 500 kcal/day is the conventional figure for roughly a pound a week, which is
-- where it starts. It is a preference, so it lives in settings rather than
-- being derived: deriving it from the mission target and a deadline would make
-- a missed day quietly raise every future day's bar, which is how a tracker
-- turns into a ratchet.
alter table public.app_settings
  add column if not exists daily_deficit_goal integer not null default 500
    check (daily_deficit_goal between 100 and 3000);
