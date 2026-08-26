/**
 * Browser-local backend.
 *
 * Used when `VITE_DEMO_MODE=1`. Everything persists to localStorage, so the
 * whole application is fully usable, and fully honest about being a demo,
 * before a Supabase project exists. It is also the fastest way to check a UI
 * change without touching real data.
 */

import type { Activity, BodyEntry, DailyRecord, Settings } from '../../core/types'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { toActivity, toBodyEntry, toDailyRecord, type SyncLog } from '../mappers'
import type { Backend, BulkDailyRow, DemoActivityInput, ManualActivityInput } from './types'

const KEY = 'mission-local-db'

interface Db {
  settings: Settings
  daily: Record<string, Record<string, unknown>>
  body: Record<string, Record<string, unknown>>
  activities: Record<string, unknown>[]
  syncLogs: SyncLog[]
}

function emptyDb(): Db {
  return { settings: DEFAULT_SETTINGS, daily: {}, body: {}, activities: [], syncLogs: [] }
}

function read(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyDb()
    return { ...emptyDb(), ...(JSON.parse(raw) as Db) }
  } catch {
    return emptyDb()
  }
}

function write(db: Db): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

/** Drop nulls so a partial write never blanks a column that already has a value. */
function mergeDefined(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined))
  return { ...target, ...defined }
}

let counter = 0
const nextId = () => `local-${Date.now().toString(36)}-${counter++}`

export const local: Backend = {
  async fetchSettings() {
    return read().settings
  },

  async saveSettings(settings) {
    const db = read()
    db.settings = settings
    write(db)
    return settings
  },

  async fetchDailyMetrics(sinceDate) {
    const db = read()
    return Object.values(db.daily)
      .map(toDailyRecord)
      .filter((d) => !sinceDate || d.date >= sinceDate)
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async upsertDailyPatch(date, patch) {
    const db = read()
    db.daily[date] = mergeDefined(db.daily[date] ?? { date }, { ...patch, date })
    write(db)
  },

  async fetchBodyEntries() {
    const db = read()
    return Object.values(db.body).map(toBodyEntry).sort((a, b) => a.date.localeCompare(b.date))
  },

  async upsertBodyEntry(entry) {
    const db = read()
    db.body[entry.date] = mergeDefined(db.body[entry.date] ?? { date: entry.date }, {
      date: entry.date,
      weight_kg: entry.weightKg ?? null,
      waist_cm: entry.waistCm ?? null,
      neck_cm: entry.neckCm ?? null,
      hip_cm: entry.hipCm ?? null,
      planning_body_fat_override: entry.planningBodyFatOverride ?? null,
      notes: entry.notes ?? null,
      source: entry.source ?? 'manual',
    })
    write(db)
  },

  async deleteBodyEntry(date) {
    const db = read()
    delete db.body[date]
    write(db)
  },

  async fetchActivities() {
    return read()
      .activities.map(toActivity)
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
  },

  async saveManualActivity(activity: ManualActivityInput) {
    const db = read()
    db.activities.push({
      id: nextId(),
      external_source: 'manual',
      external_id: `manual-${activity.startTime}-${activity.activityType}`,
      activity_type: activity.activityType,
      raw_activity_type: activity.activityType,
      start_time: activity.startTime,
      duration_seconds: activity.durationSeconds,
      distance_meters: activity.distanceMeters,
      calories: activity.calories,
      notes: activity.notes,
    })
    write(db)
  },

  async updateActivityType(id, activityType) {
    const db = read()
    const found = db.activities.find((a) => a.id === id)
    if (found) found.activity_type = activityType
    write(db)
  },

  async deleteActivity(id) {
    const db = read()
    db.activities = db.activities.filter((a) => a.id !== id)
    write(db)
  },

  async fetchSyncLogs(limit = 20) {
    return read().syncLogs.slice(0, limit)
  },

  async bulkUpsertDaily(rows: BulkDailyRow[]) {
    const db = read()
    for (const row of rows) {
      db.daily[row.date] = mergeDefined(db.daily[row.date] ?? { date: row.date }, row)
    }
    write(db)
    return rows.length
  },

  async bulkUpsertBody(entries) {
    const db = read()
    for (const e of entries) {
      db.body[e.date] = mergeDefined(db.body[e.date] ?? { date: e.date }, {
        date: e.date,
        weight_kg: e.weightKg ?? null,
        waist_cm: e.waistCm ?? null,
        neck_cm: e.neckCm ?? null,
        hip_cm: e.hipCm ?? null,
        source: e.source ?? 'manual',
      })
    }
    write(db)
    return entries.length
  },

  async bulkInsertDemoActivities(items: DemoActivityInput[]) {
    const db = read()
    const existing = new Set(db.activities.map((a) => a.external_id))
    for (const a of items) {
      const externalId = `demo-${a.startTime}-${a.activityType}`
      if (existing.has(externalId)) continue
      db.activities.push({
        id: nextId(),
        external_source: 'demo',
        external_id: externalId,
        activity_type: a.activityType,
        raw_activity_type: a.activityType,
        start_time: a.startTime,
        duration_seconds: a.durationSeconds,
        distance_meters: a.distanceMeters,
        calories: a.calories,
        average_speed_mps:
          a.distanceMeters && a.durationSeconds ? a.distanceMeters / a.durationSeconds : null,
      })
    }
    write(db)
    return items.length
  },

  async exportEverything() {
    const db = read()
    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      mode: 'local-demo',
      settings: db.settings,
      dailyMetrics: Object.values(db.daily).map(toDailyRecord),
      bodyEntries: Object.values(db.body).map(toBodyEntry),
      activities: db.activities.map(toActivity),
      syncLogs: db.syncLogs,
    }
  },

  async clearAllData() {
    const db = read()
    write({ ...emptyDb(), settings: db.settings })
  },

  async clearDemoData() {
    const db = read()
    for (const [date, row] of Object.entries(db.daily)) {
      if (row.is_demo) delete db.daily[date]
    }
    for (const [date, row] of Object.entries(db.body)) {
      if (row.source === 'demo') delete db.body[date]
    }
    db.activities = db.activities.filter((a) => a.external_source !== 'demo')
    write(db)
  },
}

/** Seed a plausible history the first time demo mode is opened. */
export function seedLocalIfEmpty(daily: BulkDailyRow[], body: (Partial<BodyEntry> & { date: string })[], activities: DemoActivityInput[]): boolean {
  const db = read()
  if (Object.keys(db.daily).length > 0) return false
  void local.bulkUpsertDaily(daily)
  void local.bulkUpsertBody(body)
  void local.bulkInsertDemoActivities(activities)

  const seeded = read()
  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  seeded.syncLogs = [
    { provider: 'garmin', startedAt: hoursAgo(6), completedAt: hoursAgo(6), status: 'success', recordsImported: 1, errorMessage: null },
    { provider: 'mfp', startedAt: hoursAgo(6), completedAt: hoursAgo(6), status: 'success', recordsImported: 1, errorMessage: null },
  ]
  write(seeded)
  return true
}

export type { Activity, BodyEntry, DailyRecord, Settings }
