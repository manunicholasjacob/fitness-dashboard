import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client.
 *
 * The anon key is published in the bundle by design: it is a public
 * identifier, not a secret, and every table is gated by row-level security
 * that requires `auth.uid() = user_id`. Signed out, it can read nothing.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the app has been pointed at a real project. */
export const isConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // Stay signed in on this device indefinitely. One login per phone.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'mission-auth',
      },
    })
  : null

export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and set ' +
        'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return supabase
}
