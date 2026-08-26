-- Record how current each day's Garmin data actually is.
--
-- Garmin's servers only hold what the watch has uploaded. A watch that last
-- synced at 09:04 leaves the API reporting 09:04's figures all afternoon, and
-- the dashboard then disagrees with the phone app, which reads the watch live
-- over Bluetooth. That looks like a broken integration and is not one.
--
-- Storing the cut-off makes the difference visible: the dashboard can say the
-- data runs through 09:04 rather than silently presenting it as current.

alter table public.daily_metrics
  add column if not exists garmin_data_through timestamptz;

comment on column public.daily_metrics.garmin_data_through is
  'End of the wellness window Garmin actually holds for this day, from the last watch upload.';
