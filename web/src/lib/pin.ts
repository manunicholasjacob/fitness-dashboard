/**
 * Unlock code.
 *
 * The code is the only way in. It is verified by an edge function, never in the
 * browser, so the account credentials are not present in the published bundle
 * and cannot be read out of it. The client sends a code and receives a session.
 *
 * That server-side check is the whole reason this is safe to do. Embedding the
 * credentials so the browser could sign itself in would hand full database
 * access to anyone who opened the JavaScript.
 */

const UNLOCKED_KEY = 'mission-unlocked'

export const MIN_CODE_LENGTH = 4
export const MAX_CODE_LENGTH = 10

export interface UnlockResult {
  ok: boolean
  /** Present on success. */
  session?: { access_token: string; refresh_token: string }
  /** Present on failure, safe to show. */
  error?: string
  /** True when the server is throttling further attempts. */
  throttled?: boolean
}

/** Exchange a code for a session. */
export async function redeemCode(code: string): Promise<UnlockResult> {
  let response: Response
  try {
    response = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' }
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    /* fall through to the status-based message */
  }

  if (response.ok && typeof payload.access_token === 'string' && typeof payload.refresh_token === 'string') {
    return {
      ok: true,
      session: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      },
    }
  }

  return {
    ok: false,
    throttled: response.status === 429,
    error:
      typeof payload.error === 'string'
        ? payload.error
        : `Unlock failed (${response.status}).`,
  }
}

/**
 * Whether this browsing session has already been unlocked.
 *
 * sessionStorage, not localStorage: it survives navigation inside the app but
 * not closing it, which is the behaviour a lock screen should have. The
 * Supabase session itself persists separately, so unlocking again does not
 * require another round trip in most cases.
 */
export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) === '1'
  } catch {
    return false
  }
}

export function markUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCKED_KEY, '1')
  } catch {
    /* the lock simply re-prompts on the next navigation */
  }
}

export function lock(): void {
  try {
    sessionStorage.removeItem(UNLOCKED_KEY)
  } catch {
    /* ignore */
  }
}
