/**
 * Device unlock code.
 *
 * This is a lock screen, not authentication. Access control is still Supabase
 * Auth plus row-level security: the app only reaches this point when it already
 * holds a valid session for the account. The code exists so the everyday path
 * is four digits instead of an email and a password.
 *
 * That distinction is why the credentials are not embedded anywhere. If they
 * were, anyone could read them out of the published bundle and query the API
 * directly, and the code would be decoration. A new device still signs in
 * properly once; after that the session persists and the code takes over.
 */

const SALT = 'mission-unlock:'
const UNLOCKED_KEY = 'mission-unlocked'

export const PIN_LENGTH = 4

/** SHA-256 of the salted code, as lowercase hex. */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPin(pin: string, expectedHash: string | null): Promise<boolean> {
  if (!expectedHash) return false
  return (await hashPin(pin)) === expectedHash
}

/**
 * Whether this session is already unlocked.
 *
 * Held in sessionStorage rather than localStorage on purpose: it survives
 * navigation within the app but not closing it, so reopening the dashboard asks
 * for the code again. That is the behaviour a lock screen should have.
 */
export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) === '1'
  } catch {
    // Private mode or blocked storage: fail closed and ask for the code.
    return false
  }
}

export function markUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCKED_KEY, '1')
  } catch {
    /* the lock simply re-prompts next navigation */
  }
}

export function lock(): void {
  try {
    sessionStorage.removeItem(UNLOCKED_KEY)
  } catch {
    /* ignore */
  }
}
