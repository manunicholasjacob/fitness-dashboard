-- Add a device unlock code.
--
-- This is a convenience lock, not an authentication mechanism. Real access is
-- still Supabase Auth plus row-level security; the code gates the UI on a
-- device that already holds a valid session, so the common case is typing four
-- digits instead of an email and password.
--
-- Stored as a SHA-256 hash rather than plaintext. A four-digit hash is trivially
-- reversible, so this is not pretending to be secret: the point is simply not to
-- keep a code the owner might reuse elsewhere lying around in a table.

alter table public.app_settings
  add column if not exists unlock_pin_hash text;

comment on column public.app_settings.unlock_pin_hash is
  'SHA-256 of the device unlock code. Convenience lock only; access control is RLS.';
