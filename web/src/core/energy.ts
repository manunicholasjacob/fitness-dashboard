/**
 * The energy engine.
 *
 * Raw source values in, adjusted estimates out. Nothing here reads or writes
 * storage, so the same functions drive the UI, the tests, and any future
 * server-side recomputation.
 */

import type { ComputedDay, DailyRecord, Settings } from './types'
import { kgToLb } from './units'

/** Garmin over-reports expenditure, so we scale it down (default x0.85). */
export function adjustExpenditure(raw: number | null, settings: Settings): number | null {
  if (raw === null || !Number.isFinite(raw)) return null
  return raw * settings.garminAdjustmentFactor
}

/** Logged intake under-reports reality, so we scale it up (default x1.10). */
export function adjustIntake(raw: number | null, settings: Settings): number | null {
  if (raw === null || !Number.isFinite(raw)) return null
  return raw * settings.intakeAdjustmentFactor
}

/**
 * Derive a full day from its raw record.
 *
 * A day only contributes to the mission when BOTH sides are known. A day with
 * expenditure but no food log is not a 2,380 kcal deficit, it is an unknown,
 * and silently treating it as a win is the single easiest way to build a
 * dashboard that lies to you.
 */
export function computeDay(raw: DailyRecord, settings: Settings): ComputedDay {
  const rawExpenditure = raw.rawGarminTotalCalories
  const rawIntake = raw.rawMfpCalories
  const adjustedExpenditure = adjustExpenditure(rawExpenditure, settings)
  const adjustedIntake = adjustIntake(rawIntake, settings)
  const isComplete = adjustedExpenditure !== null && adjustedIntake !== null

  return {
    date: raw.date,
    raw,
    rawExpenditure,
    adjustedExpenditure,
    rawIntake,
    adjustedIntake,
    adjustedBalance: isComplete ? adjustedExpenditure! - adjustedIntake! : null,
    isComplete,
    morningMissionMet: morningMissionMet(raw, settings),
  }
}

export function computeDays(records: DailyRecord[], settings: Settings): ComputedDay[] {
  return records
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => computeDay(r, settings))
}

/**
 * Whether the morning step goal was met.
 *
 * Returns null (not false) when we have no morning reading at all, so an
 * un-synced day does not silently break a streak.
 */
export function morningMissionMet(raw: DailyRecord, settings: Settings): boolean | null {
  if (raw.stepsBeforeDeadline === null) return null
  return raw.stepsBeforeDeadline >= settings.morningStepGoal
}

/** Sum of adjusted balances across complete days. Surpluses subtract. */
export function cumulativeBalance(days: ComputedDay[]): number {
  return days.reduce((sum, d) => sum + (d.adjustedBalance ?? 0), 0)
}

export interface MissionProgress {
  target: number
  accumulated: number
  remaining: number
  percent: number
  /** Theoretical pounds implied by the accumulated deficit. Not a weight claim. */
  theoreticalPoundsLost: number
  completeDays: number
  incompleteDays: number
  averagePerCompleteDay: number | null
}

export function missionTarget(settings: Settings): number {
  if (settings.missionTargetOverride !== null) return settings.missionTargetOverride
  const poundsToLose = kgToLb(settings.startingWeightKg) - kgToLb(settings.targetWeightKg)
  const theoretical = poundsToLose * settings.caloriesPerPound
  return Math.round(theoretical * (1 + settings.missionBufferPercent / 100))
}

export function missionProgress(days: ComputedDay[], settings: Settings): MissionProgress {
  const target = missionTarget(settings)
  const accumulated = cumulativeBalance(days)
  const completeDays = days.filter((d) => d.isComplete).length
  const incompleteDays = days.length - completeDays

  return {
    target,
    accumulated,
    remaining: target - accumulated,
    // Clamped for the progress bar's sake; the raw numbers stay honest above.
    percent: target > 0 ? Math.max(0, Math.min(100, (accumulated / target) * 100)) : 0,
    theoreticalPoundsLost: accumulated / settings.caloriesPerPound,
    completeDays,
    incompleteDays,
    averagePerCompleteDay: completeDays > 0 ? accumulated / completeDays : null,
  }
}

/** Running cumulative total, for the mission-progress chart. */
export function cumulativeSeries(days: ComputedDay[]): { date: string; cumulative: number }[] {
  let running = 0
  return days.map((d) => {
    running += d.adjustedBalance ?? 0
    return { date: d.date, cumulative: running }
  })
}

/**
 * Beyond this horizon a projection stops being information.
 *
 * A trickle of 16 kcal/day technically finishes an 84,000 kcal mission, in the
 * year 2041. Reporting that as an "estimated finish date" is worse than
 * reporting nothing, so anything past two years is suppressed.
 */
export const MAX_PROJECTION_DAYS = 730

/**
 * Projected completion date, extrapolating the recent average daily balance.
 *
 * Returns null when the recent trend is flat, negative, or so slow that the
 * projection lands beyond the horizon above.
 */
export function projectMissionCompletion(
  days: ComputedDay[],
  settings: Settings,
  lookbackDays = 14,
): { date: Date; daysRemaining: number; basis: number } | null {
  const progress = missionProgress(days, settings)
  if (progress.remaining <= 0) return null

  const recent = days.filter((d) => d.isComplete).slice(-lookbackDays)
  if (recent.length < 3) return null

  const avg = recent.reduce((s, d) => s + (d.adjustedBalance ?? 0), 0) / recent.length
  if (avg <= 0) return null

  const daysRemaining = Math.ceil(progress.remaining / avg)
  if (daysRemaining > MAX_PROJECTION_DAYS) return null

  const date = new Date()
  date.setDate(date.getDate() + daysRemaining)
  return { date, daysRemaining, basis: avg }
}
