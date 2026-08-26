/**
 * Stale-while-revalidate cache backed by localStorage.
 *
 * The point is perceived latency: opening the app on your phone should paint
 * last night's numbers in one frame, then quietly correct itself when the
 * network answers. A spinner on every cold open is the thing that makes a PWA
 * feel like a website.
 */

const PREFIX = 'mission-cache:'
const VERSION = 'v1'

interface Envelope<T> {
  version: string
  storedAt: number
  data: T
}

export function readCache<T>(key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope<T>
    // A schema change must not resurrect rows shaped like the old model.
    if (env.version !== VERSION) return null
    if (Date.now() - env.storedAt > maxAgeMs) return null
    return env.data
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const env: Envelope<T> = { version: VERSION, storedAt: Date.now(), data }
    localStorage.setItem(PREFIX + key, JSON.stringify(env))
  } catch {
    // A full or unavailable quota is not worth breaking a render over.
  }
}

export function cacheAge(key: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope<unknown>
    return Date.now() - env.storedAt
  } catch {
    return null
  }
}

export function clearCache(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
