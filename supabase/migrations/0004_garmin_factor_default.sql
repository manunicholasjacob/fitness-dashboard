-- The Garmin correction moves from 0.85 to 0.90.
--
-- Only the default changes here. Existing rows are left alone deliberately:
-- the factor is a preference, and silently rewriting someone's chosen value
-- during a migration is exactly the kind of surprise this schema avoids. The
-- live account was updated separately.
--
-- No stored figure needs touching either. Only raw source data is persisted and
-- every adjusted number is derived at read time, so history reprices the moment
-- the setting changes.
alter table public.app_settings
  alter column garmin_adjustment_factor set default 0.9;
