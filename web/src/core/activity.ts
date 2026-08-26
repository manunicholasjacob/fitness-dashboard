/** Workout aggregation and filtering. */

import type { Activity, ActivityType } from './types'
import { metersToMiles } from './units'

export type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

export interface DateRange {
  from: Date
  to: Date
}

/** Resolve a named range to concrete bounds. Weeks start Monday. */
export function resolveRange(key: RangeKey, now = new Date(), custom?: DateRange): DateRange {
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)

  switch (key) {
    case 'today':
      break
    case 'week': {
      const dow = (from.getDay() + 6) % 7 // Monday = 0
      from.setDate(from.getDate() - dow)
      break
    }
    case 'month':
      from.setDate(1)
      break
    case 'quarter':
      from.setMonth(from.getMonth() - 3)
      break
    case 'year':
      from.setFullYear(from.getFullYear() - 1)
      break
    case 'all':
      from.setFullYear(1970, 0, 1)
      break
    case 'custom':
      if (custom) return custom
      break
  }
  return { from, to }
}

export function filterActivities(activities: Activity[], range: DateRange): Activity[] {
  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  return activities
    .filter((a) => {
      const t = Date.parse(a.startTime)
      return Number.isFinite(t) && t >= fromMs && t <= toMs
    })
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
}

export interface ActivitySummary {
  count: number
  totalSeconds: number
  totalCalories: number
  totalMeters: number
  averageHr: number | null
  byType: Record<string, { count: number; seconds: number; meters: number; calories: number }>
}

export function summarize(activities: Activity[]): ActivitySummary {
  const byType: ActivitySummary['byType'] = {}
  let totalSeconds = 0
  let totalCalories = 0
  let totalMeters = 0
  let hrSum = 0
  let hrCount = 0

  for (const a of activities) {
    totalSeconds += a.durationSeconds || 0
    totalCalories += a.calories ?? 0
    totalMeters += a.distanceMeters ?? 0
    if (a.averageHr) {
      hrSum += a.averageHr
      hrCount++
    }
    const bucket = (byType[a.activityType] ??= { count: 0, seconds: 0, meters: 0, calories: 0 })
    bucket.count++
    bucket.seconds += a.durationSeconds || 0
    bucket.meters += a.distanceMeters ?? 0
    bucket.calories += a.calories ?? 0
  }

  return {
    count: activities.length,
    totalSeconds,
    totalCalories,
    totalMeters,
    averageHr: hrCount > 0 ? hrSum / hrCount : null,
    byType,
  }
}

export interface RunningStats {
  runs: number
  totalMeters: number
  totalMiles: number
  totalSeconds: number
  averageSpeedMps: number | null
  bestSpeedMps: number | null
  longestRunMeters: number | null
}

/** Running-specific rollup. Pace comes from totals, not an average of averages. */
export function runningStats(activities: Activity[]): RunningStats {
  const runs = activities.filter((a) => a.activityType === 'running')
  const totalMeters = runs.reduce((s, a) => s + (a.distanceMeters ?? 0), 0)
  const totalSeconds = runs.reduce((s, a) => s + (a.durationSeconds || 0), 0)

  // Only rank pace across runs long enough for the number to mean anything.
  const paced = runs.filter((a) => (a.distanceMeters ?? 0) >= 800 && a.durationSeconds > 0)
  const speeds = paced.map((a) => (a.distanceMeters as number) / a.durationSeconds)

  return {
    runs: runs.length,
    totalMeters,
    totalMiles: metersToMiles(totalMeters),
    totalSeconds,
    averageSpeedMps: totalSeconds > 0 ? totalMeters / totalSeconds : null,
    bestSpeedMps: speeds.length > 0 ? Math.max(...speeds) : null,
    longestRunMeters: runs.length > 0 ? Math.max(...runs.map((a) => a.distanceMeters ?? 0)) : null,
  }
}

/** Consecutive days ending today (or yesterday) containing at least one workout. */
export function workoutStreak(activities: Activity[], now = new Date()): number {
  const days = new Set(activities.map((a) => a.startTime.slice(0, 10)))
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0) // midday avoids DST/UTC edge cases when formatting

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // A rest day today should not erase a streak built through yesterday.
  if (!days.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (days.has(iso(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

const TYPE_PATTERNS: [RegExp, ActivityType][] = [
  [/run|tread|track/i, 'running'],
  [/walk/i, 'walking'],
  [/cycl|bik|spin/i, 'cycling'],
  [/swim/i, 'swimming'],
  [/strength|weight|gym|resistance/i, 'strength'],
  [/climb|boulder/i, 'climbing'],
  [/hik/i, 'hiking'],
  [/cardio|elliptical|row|hiit/i, 'cardio'],
]

/** Map a Garmin activity type string onto our fixed category set. */
export function normalizeActivityType(raw: string | null | undefined): ActivityType {
  if (!raw) return 'other'
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(raw)) return type
  }
  return 'other'
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: 'Running',
  walking: 'Walking',
  cycling: 'Cycling',
  swimming: 'Swimming',
  strength: 'Strength',
  climbing: 'Climbing',
  hiking: 'Hiking',
  cardio: 'Cardio',
  other: 'Other',
}
