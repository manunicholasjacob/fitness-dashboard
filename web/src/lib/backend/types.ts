/**
 * The storage contract.
 *
 * Two implementations satisfy it: `remote` talks to Supabase, `local` keeps
 * everything in this browser. Because the app only ever calls through this
 * interface, demo mode is a genuine end-to-end exercise of the UI rather than
 * a set of hard-coded placeholder screens.
 */

import type { Activity, BodyEntry, DailyRecord, Settings } from '../../core/types'
import type { SyncLog } from '../mappers'

export interface BulkDailyRow {
  date: string
  [column: string]: unknown
}

export interface ManualActivityInput {
  activityType: string
  startTime: string
  durationSeconds: number
  distanceMeters: number | null
  calories: number | null
  notes: string | null
}

export interface DemoActivityInput {
  activityType: string
  startTime: string
  durationSeconds: number
  distanceMeters: number | null
  calories: number | null
}

export interface Backend {
  fetchSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>

  fetchDailyMetrics(sinceDate?: string): Promise<DailyRecord[]>
  upsertDailyPatch(date: string, patch: Record<string, unknown>): Promise<void>

  fetchBodyEntries(): Promise<BodyEntry[]>
  upsertBodyEntry(entry: Partial<BodyEntry> & { date: string }): Promise<void>
  deleteBodyEntry(date: string): Promise<void>

  fetchActivities(): Promise<Activity[]>
  saveManualActivity(activity: ManualActivityInput): Promise<void>
  updateActivityType(id: string, activityType: string): Promise<void>
  deleteActivity(id: string): Promise<void>

  fetchSyncLogs(limit?: number): Promise<SyncLog[]>

  bulkUpsertDaily(rows: BulkDailyRow[]): Promise<number>
  bulkUpsertBody(entries: (Partial<BodyEntry> & { date: string })[]): Promise<number>
  bulkInsertDemoActivities(items: DemoActivityInput[]): Promise<number>

  exportEverything(): Promise<Record<string, unknown>>
  clearAllData(): Promise<void>
  clearDemoData(): Promise<void>
}
