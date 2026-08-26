/**
 * Storage facade.
 *
 * The rest of the app imports from here and never knows which backend it is
 * talking to. Demo mode swaps the implementation, not the call sites.
 */

import { local } from './backend/local'
import { remote } from './backend/remote'
import type { Backend } from './backend/types'

/** Set VITE_DEMO_MODE=1 to run entirely in the browser with no Supabase project. */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === '1'

const backend: Backend = isDemoMode ? local : remote

export const fetchSettings = () => backend.fetchSettings()
export const saveSettings: Backend['saveSettings'] = (s) => backend.saveSettings(s)

export const fetchDailyMetrics: Backend['fetchDailyMetrics'] = (since) =>
  backend.fetchDailyMetrics(since)
export const upsertDailyPatch: Backend['upsertDailyPatch'] = (date, patch) =>
  backend.upsertDailyPatch(date, patch)

export const fetchBodyEntries = () => backend.fetchBodyEntries()
export const upsertBodyEntry: Backend['upsertBodyEntry'] = (entry) => backend.upsertBodyEntry(entry)
export const deleteBodyEntry: Backend['deleteBodyEntry'] = (date) => backend.deleteBodyEntry(date)

export const fetchActivities = () => backend.fetchActivities()
export const saveManualActivity: Backend['saveManualActivity'] = (a) => backend.saveManualActivity(a)
export const updateActivityType: Backend['updateActivityType'] = (id, type) =>
  backend.updateActivityType(id, type)
export const deleteActivity: Backend['deleteActivity'] = (id) => backend.deleteActivity(id)

export const fetchSyncLogs: Backend['fetchSyncLogs'] = (limit) => backend.fetchSyncLogs(limit)

export const bulkUpsertDaily: Backend['bulkUpsertDaily'] = (rows) => backend.bulkUpsertDaily(rows)
export const bulkUpsertBody: Backend['bulkUpsertBody'] = (entries) => backend.bulkUpsertBody(entries)
export const bulkInsertDemoActivities: Backend['bulkInsertDemoActivities'] = (items) =>
  backend.bulkInsertDemoActivities(items)

export const exportEverything = () => backend.exportEverything()
export const clearAllData = () => backend.clearAllData()
export const clearDemoData = () => backend.clearDemoData()

export type { BulkDailyRow } from './backend/types'
