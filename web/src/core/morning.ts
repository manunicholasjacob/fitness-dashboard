/**
 * Morning Mission: N steps before a deadline, every day.
 *
 * Streak rule: a day with no morning reading at all is *skipped*, not counted
 * as a failure. A dead watch battery or a missed sync is not a behavioural
 * lapse, and a streak that resets for reasons outside your control stops being
 * a motivator very quickly.
 */

import type { ComputedDay, Settings } from './types'

export interface MorningStats {
  goal: number
  deadline: string
  todayStepsBeforeDeadline: number | null
  todayMet: boolean | null
  currentStreak: number
  longestStreak: number
  successRate7: number | null
  successRate30: number | null
  successRateAll: number | null
  averageMorningSteps: number | null
  averageTotalSteps: number | null
  daysWithData: number
  totalSuccesses: number
}

function rate(days: ComputedDay[]): number | null {
  const scored = days.filter((d) => d.morningMissionMet !== null)
  if (scored.length === 0) return null
  return (scored.filter((d) => d.morningMissionMet).length / scored.length) * 100
}

function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (present.length === 0) return null
  return present.reduce((s, v) => s + v, 0) / present.length
}

export function morningStats(days: ComputedDay[], settings: Settings): MorningStats {
  const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date))
  const today = sorted[sorted.length - 1]

  // Current streak: walk backwards, skipping unknown days, stop at a real miss.
  let currentStreak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const met = sorted[i].morningMissionMet
    if (met === null) continue
    if (met) currentStreak++
    else break
  }

  let longestStreak = 0
  let run = 0
  for (const d of sorted) {
    if (d.morningMissionMet === null) continue
    if (d.morningMissionMet) {
      run++
      longestStreak = Math.max(longestStreak, run)
    } else {
      run = 0
    }
  }

  const scored = sorted.filter((d) => d.morningMissionMet !== null)

  return {
    goal: settings.morningStepGoal,
    deadline: settings.morningDeadline,
    todayStepsBeforeDeadline: today?.raw.stepsBeforeDeadline ?? null,
    todayMet: today?.morningMissionMet ?? null,
    currentStreak,
    longestStreak,
    successRate7: rate(sorted.slice(-7)),
    successRate30: rate(sorted.slice(-30)),
    successRateAll: rate(sorted),
    averageMorningSteps: mean(sorted.map((d) => d.raw.stepsBeforeDeadline)),
    averageTotalSteps: mean(sorted.map((d) => d.raw.stepsTotal)),
    daysWithData: scored.length,
    totalSuccesses: scored.filter((d) => d.morningMissionMet).length,
  }
}

/** Minutes left until the deadline today, or null once it has passed. */
export function minutesUntilDeadline(deadline: string, now = new Date()): number | null {
  const [h, m] = deadline.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  const diffMinutes = Math.floor((target.getTime() - now.getTime()) / 60_000)
  return diffMinutes >= 0 ? diffMinutes : null
}
