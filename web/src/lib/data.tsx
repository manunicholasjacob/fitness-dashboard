import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Activity, BodyEntry, ComputedDay, DailyRecord, Settings } from '../core/types'
import { computeDays } from '../core/energy'
import { DEFAULT_SETTINGS } from '../core/settings'
import { cacheAge, readCache, writeCache } from './cache'
import * as api from './api'
import { isDemoMode } from './api'
import { seedLocalIfEmpty } from './backend/local'
import { generateDemoData } from './demo'
import type { SyncLog } from './mappers'
import { useAuth } from './auth'

interface Snapshot {
  settings: Settings
  daily: DailyRecord[]
  body: BodyEntry[]
  activities: Activity[]
  syncLogs: SyncLog[]
}

interface DataState extends Snapshot {
  /** Days with all adjustments applied. This is what the UI renders. */
  days: ComputedDay[]
  loading: boolean
  refreshing: boolean
  error: string | null
  /** Age of the painted data in ms when it came from cache, else null. */
  servedFromCacheMs: number | null
  refresh: () => Promise<void>
  updateSettings: (next: Settings) => Promise<void>
}

const CACHE_KEY = 'snapshot'

const EMPTY: Snapshot = {
  settings: DEFAULT_SETTINGS,
  daily: [],
  body: [],
  activities: [],
  syncLogs: [],
}

const DataContext = createContext<DataState | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [servedFromCacheMs, setServedFromCacheMs] = useState<number | null>(null)
  const inflight = useRef(false)

  const load = useCallback(async () => {
    if (!session) return
    // Guard against overlapping loads from focus + interval + manual refresh.
    if (inflight.current) return
    inflight.current = true
    setRefreshing(true)
    setError(null)

    try {
      if (isDemoMode) {
        const demo = generateDemoData(45)
        seedLocalIfEmpty(demo.daily, demo.body, demo.activities)
      }
      const [settings, daily, body, activities, syncLogs] = await Promise.all([
        api.fetchSettings(),
        api.fetchDailyMetrics(),
        api.fetchBodyEntries(),
        api.fetchActivities(),
        api.fetchSyncLogs(),
      ])
      const next: Snapshot = { settings, daily, body, activities, syncLogs }
      setSnapshot(next)
      writeCache(CACHE_KEY, next)
      setServedFromCacheMs(null)
    } catch (e) {
      // A failed refresh must not blank the screen: the cached snapshot on
      // display is still the best information we have.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inflight.current = false
      setRefreshing(false)
      setLoading(false)
    }
  }, [session])

  // Paint from cache immediately, then revalidate.
  useEffect(() => {
    if (!session) {
      setSnapshot(EMPTY)
      setLoading(false)
      return
    }
    const cached = readCache<Snapshot>(CACHE_KEY)
    if (cached) {
      setSnapshot({ ...EMPTY, ...cached })
      setServedFromCacheMs(cacheAge(CACHE_KEY))
      setLoading(false)
    }
    void load()
  }, [session, load])

  // Refresh when the app comes back to the foreground, which on a phone is the
  // moment that actually matters.
  useEffect(() => {
    if (!session) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [session, load])

  const updateSettings = useCallback(async (next: Settings) => {
    // Optimistic: adjustment factors re-price every chart, and waiting on a
    // round-trip to see that happen makes the settings page feel broken.
    setSnapshot((s) => ({ ...s, settings: next }))
    try {
      const saved = await api.saveSettings(next)
      setSnapshot((s) => {
        const merged = { ...s, settings: saved }
        writeCache(CACHE_KEY, merged)
        return merged
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }, [])

  const days = useMemo(
    () => computeDays(snapshot.daily, snapshot.settings),
    [snapshot.daily, snapshot.settings],
  )

  const value: DataState = {
    ...snapshot,
    days,
    loading,
    refreshing,
    error,
    servedFromCacheMs,
    refresh: load,
    updateSettings,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
