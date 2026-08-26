/**
 * Exchange an unlock code for a Supabase session.
 *
 * This runs on Cloudflare's edge, not in the browser, which is the whole point.
 * The account's email and password live here as environment secrets and never
 * reach the client. The browser only ever sends a code and receives a session,
 * so reading the published bundle reveals nothing usable.
 *
 * The alternative, embedding the credentials in the app so a code alone unlocks
 * it, would put full database access in a file anyone can download. This costs
 * one edge function and removes that entirely.
 *
 * The honest limitation: a short numeric code is a small search space, and this
 * endpoint is reachable by anyone who finds the URL. The mitigations below make
 * guessing slow and noisy rather than impossible, which is why the code length
 * is not fixed at four.
 */

interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  APP_EMAIL: string
  APP_PASSWORD: string
  /** Salted SHA-256 of the unlock code, hex. */
  UNLOCK_CODE_HASH: string
  /** Optional KV namespace used for throttling. Absent means delay-only. */
  UNLOCK_THROTTLE?: KVNamespace
}

const SALT = 'mission-unlock:'

/** Every attempt costs this long, successful or not. */
const ATTEMPT_DELAY_MS = 900
const MAX_FAILURES = 10
const LOCKOUT_SECONDS = 900

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compare without leaking where two strings diverge. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.UNLOCK_CODE_HASH || !env.APP_EMAIL || !env.APP_PASSWORD || !env.SUPABASE_URL) {
    return json({ error: 'Unlock is not configured on the server.' }, 500)
  }

  // Throttle per client. Without a KV binding this degrades to the fixed delay
  // below, which still turns a full sweep into hours rather than seconds.
  const clientId = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const throttleKey = `fail:${clientId}`
  if (env.UNLOCK_THROTTLE) {
    const failures = Number((await env.UNLOCK_THROTTLE.get(throttleKey)) ?? '0')
    if (failures >= MAX_FAILURES) {
      return json(
        { error: 'Too many attempts. Try again later.' },
        429,
      )
    }
  }

  let code = ''
  try {
    const body = (await request.json()) as { code?: unknown }
    code = typeof body.code === 'string' ? body.code.trim() : ''
  } catch {
    return json({ error: 'Malformed request.' }, 400)
  }

  if (!/^\d{4,10}$/.test(code)) {
    await sleep(ATTEMPT_DELAY_MS)
    return json({ error: 'Incorrect code.' }, 401)
  }

  // A constant cost on every attempt, before the answer is known.
  await sleep(ATTEMPT_DELAY_MS)

  const supplied = await sha256Hex(SALT + code)
  if (!timingSafeEqual(supplied, env.UNLOCK_CODE_HASH.trim().toLowerCase())) {
    if (env.UNLOCK_THROTTLE) {
      const failures = Number((await env.UNLOCK_THROTTLE.get(throttleKey)) ?? '0') + 1
      await env.UNLOCK_THROTTLE.put(throttleKey, String(failures), {
        expirationTtl: LOCKOUT_SECONDS,
      })
    }
    return json({ error: 'Incorrect code.' }, 401)
  }

  // Correct code: sign in on the server and hand back only the session.
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: env.APP_EMAIL, password: env.APP_PASSWORD }),
  })

  if (!response.ok) {
    // The code was right, so this is a server-side configuration problem and
    // must not be reported as a bad code.
    return json(
      { error: 'The code was accepted but sign-in failed. Check the server configuration.' },
      502,
    )
  }

  const session = (await response.json()) as {
    access_token?: string
    refresh_token?: string
  }
  if (!session.access_token || !session.refresh_token) {
    return json({ error: 'Sign-in returned no session.' }, 502)
  }

  if (env.UNLOCK_THROTTLE) await env.UNLOCK_THROTTLE.delete(throttleKey)

  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}

/** Anything other than POST is not part of this endpoint's contract. */
export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  if (request.method === 'POST') return next()
  return json({ error: 'Method not allowed.' }, 405)
}
