/** Every read and write against Supabase lives here. */

import { requireClient } from '../supabase'
import {
  fromBodyEntry,
  fromSettings,
  toActivity,
  toBodyEntry,
  toDailyRecord,
  toSettings,
  toSyncLog,
  type SyncLog,
} from '../mappers'
import type { Activity, BodyEntry, DailyRecord, Settings } from '../../core/types'
import type { Backend, BulkDailyRow, DemoActivityInput, ManualActivityInput } from './types'

async function currentUserId(): Promise<string> {
  const { data, error } = await requireClient().auth.getUser()
  if (error || !data.user) throw new Error('Not signed in.')
  return data.user.id
}

// --- Settings ----------------------------------------------------------------

export async function fetchSettings(): Promise<Settings> {
  const userId = await currentUserId()
  const { data, error } = await requireClient()
    .from('app_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return toSettings(data)
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const userId = await currentUserId()
  const { data, error } = await requireClient()
    .from('app_settings')
    .upsert({ user_id: userId, ...fromSettings(settings) }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) throw error
  return toSettings(data)
}

// --- Daily metrics -----------------------------------------------------------

export async function fetchDailyMetrics(sinceDate?: string): Promise<DailyRecord[]> {
  const userId = await currentUserId()
  let query = requireClient()
    .from('daily_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (sinceDate) query = query.gte('date', sinceDate)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(toDailyRecord)
}

/**
 * Patch one day's raw values.
 *
 * Upserts on (user_id, date) and only writes the columns provided, so entering
 * tonight's calories never clobbers this morning's Garmin sync.
 */
export async function upsertDailyPatch(
  date: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const userId = await currentUserId()
  const { error } = await requireClient()
    .from('daily_metrics')
    .upsert({ user_id: userId, date, ...patch }, { onConflict: 'user_id,date' })
  if (error) throw error
}

// --- Body entries ------------------------------------------------------------

export async function fetchBodyEntries(): Promise<BodyEntry[]> {
  const userId = await currentUserId()
  const { data, error } = await requireClient()
    .from('body_entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toBodyEntry)
}

/**
 * Save a check-in without erasing fields you left blank.
 *
 * Logging just a weight today must not wipe the waist you measured this
 * morning, so nulls in the patch are dropped rather than written.
 */
export async function upsertBodyEntry(entry: Partial<BodyEntry> & { date: string }): Promise<void> {
  const userId = await currentUserId()
  const full = fromBodyEntry(entry)
  const payload = Object.fromEntries(
    Object.entries(full).filter(([k, v]) => k === 'date' || k === 'source' || v !== null),
  )
  const { error } = await requireClient()
    .from('body_entries')
    .upsert({ user_id: userId, ...payload }, { onConflict: 'user_id,date' })
  if (error) throw error
}

export async function deleteBodyEntry(date: string): Promise<void> {
  const userId = await currentUserId()
  const { error } = await requireClient()
    .from('body_entries')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw error
}

// --- Activities --------------------------------------------------------------

export async function fetchActivities(): Promise<Activity[]> {
  const userId = await currentUserId()
  const { data, error } = await requireClient()
    .from('activities')
    .select('*')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(2000)
  if (error) throw error
  return (data ?? []).map(toActivity)
}

export async function saveManualActivity(activity: ManualActivityInput): Promise<void> {
  const userId = await currentUserId()
  const { error } = await requireClient().from('activities').insert({
    user_id: userId,
    external_source: 'manual',
    // A stable synthetic id keeps the dedupe unique constraint satisfied.
    external_id: `manual-${activity.startTime}-${activity.activityType}`,
    activity_type: activity.activityType,
    raw_activity_type: activity.activityType,
    start_time: activity.startTime,
    duration_seconds: activity.durationSeconds,
    distance_meters: activity.distanceMeters,
    calories: activity.calories,
    notes: activity.notes,
  })
  if (error) throw error
}

export async function updateActivityType(id: string, activityType: string): Promise<void> {
  const userId = await currentUserId()
  const { error } = await requireClient()
    .from('activities')
    .update({ activity_type: activityType })
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function deleteActivity(id: string): Promise<void> {
  const userId = await currentUserId()
  const { error } = await requireClient().from('activities').delete().eq('user_id', userId).eq('id', id)
  if (error) throw error
}

// --- Sync logs ---------------------------------------------------------------

export async function fetchSyncLogs(limit = 20): Promise<SyncLog[]> {
  const userId = await currentUserId()
  const { data, error } = await requireClient()
    .from('sync_logs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toSyncLog)
}

// --- Bulk operations ---------------------------------------------------------

/** Bulk upsert for CSV/JSON import. Chunked to stay under request limits. */
export async function bulkUpsertDaily(rows: BulkDailyRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const userId = await currentUserId()
  const client = requireClient()
  const CHUNK = 400
  let written = 0

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ user_id: userId, ...r }))
    const { error } = await client.from('daily_metrics').upsert(chunk, { onConflict: 'user_id,date' })
    if (error) throw error
    written += chunk.length
  }
  return written
}

export async function bulkUpsertBody(entries: (Partial<BodyEntry> & { date: string })[]): Promise<number> {
  if (entries.length === 0) return 0
  const userId = await currentUserId()
  const client = requireClient()
  const rows = entries.map((e) => ({ user_id: userId, ...fromBodyEntry(e) }))
  const { error } = await client.from('body_entries').upsert(rows, { onConflict: 'user_id,date' })
  if (error) throw error
  return rows.length
}

/**
 * Insert activities tagged as demo.
 *
 * Kept separate from saveManualActivity so `clearDemoData` can find and remove
 * exactly these rows and nothing you actually did.
 */
export async function bulkInsertDemoActivities(items: DemoActivityInput[]): Promise<number> {
  if (items.length === 0) return 0
  const userId = await currentUserId()
  const rows = items.map((a) => ({
    user_id: userId,
    external_source: 'demo',
    external_id: `demo-${a.startTime}-${a.activityType}`,
    activity_type: a.activityType,
    raw_activity_type: a.activityType,
    start_time: a.startTime,
    duration_seconds: a.durationSeconds,
    distance_meters: a.distanceMeters,
    calories: a.calories,
    average_speed_mps:
      a.distanceMeters && a.durationSeconds ? a.distanceMeters / a.durationSeconds : null,
  }))
  const { error } = await requireClient()
    .from('activities')
    .upsert(rows, { onConflict: 'user_id,external_source,external_id' })
  if (error) throw error
  return rows.length
}

export async function exportEverything(): Promise<Record<string, unknown>> {
  const [settings, daily, body, activities, logs] = await Promise.all([
    fetchSettings(),
    fetchDailyMetrics(),
    fetchBodyEntries(),
    fetchActivities(),
    fetchSyncLogs(200),
  ])
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    settings,
    dailyMetrics: daily,
    bodyEntries: body,
    activities,
    syncLogs: logs,
  }
}

/** Wipe measurement data. Settings survive, because re-entering them is misery. */
export async function clearAllData(): Promise<void> {
  const userId = await currentUserId()
  const client = requireClient()
  for (const table of ['daily_metrics', 'body_entries', 'activities', 'sync_logs']) {
    const { error } = await client.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }
}

export async function clearDemoData(): Promise<void> {
  const userId = await currentUserId()
  const client = requireClient()
  const a = await client.from('daily_metrics').delete().eq('user_id', userId).eq('is_demo', true)
  if (a.error) throw a.error
  const b = await client.from('body_entries').delete().eq('user_id', userId).eq('source', 'demo')
  if (b.error) throw b.error
  const c = await client.from('activities').delete().eq('user_id', userId).eq('external_source', 'demo')
  if (c.error) throw c.error
}

/** The Supabase implementation of the storage contract. */
export const remote: Backend = {
  fetchSettings,
  saveSettings,
  fetchDailyMetrics,
  upsertDailyPatch,
  fetchBodyEntries,
  upsertBodyEntry,
  deleteBodyEntry,
  fetchActivities,
  saveManualActivity,
  updateActivityType,
  deleteActivity,
  fetchSyncLogs,
  bulkUpsertDaily,
  bulkUpsertBody,
  bulkInsertDemoActivities,
  exportEverything,
  clearAllData,
  clearDemoData,
}
