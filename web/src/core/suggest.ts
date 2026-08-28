import type { Activity, ActivityType, ComputedDay, Settings } from './types'

/**
 * "What would close today's gap?"
 *
 * The mission total answers how far along you are. It does not answer what to
 * do in the next hour, and a number that only ever reports cannot be acted on.
 * This module turns the day's shortfall into concrete options: a run of this
 * many minutes, a strength session of that many, this many more steps.
 *
 * Two rules keep it from becoming a motivational toy:
 *
 * 1. **Every rate comes from the owner's own history where history exists.**
 *    A generic table says a 70 kg adult burns about 11 kcal/min running. His
 *    last three runs say 11.3. When there is real evidence the estimate uses
 *    it, and says so; the fallback is only for activity types never recorded.
 *
 * 2. **Exercise calorie estimates are wrong, and the UI says so.** These are
 *    labelled `estimated` and carry their basis. Suggesting a 34 minute run
 *    "to burn exactly 385 kcal" would be the same laundering of an assumption
 *    into a fact that the Garmin correction was retired for.
 */

/** How much of the day's goal is already banked, and what remains. */
export interface DayGap {
  /** The deficit target for a single day, in kcal. */
  goal: number
  /** Deficit so far today. Null when intake has not been logged. */
  current: number | null
  /** Still needed to reach the goal. 0 once met; null when intake is unknown. */
  remaining: number | null
  /** Fraction of the goal reached, 0-1, clamped. Null when intake is unknown. */
  progress: number | null
  /** True once the goal is reached or beaten. */
  met: boolean
  /**
   * Expenditure logged today. Present even when intake is not, because
   * "you have burned 2,400, so you can eat 1,900 and still hit the goal" is
   * useful on its own and is the common state before dinner is logged.
   */
  burnedSoFar: number | null
  /** Intake that would still leave the goal met, given what is burned. */
  intakeBudget: number | null
}

export function dayGap(today: ComputedDay | undefined, settings: Settings): DayGap {
  const goal = settings.dailyDeficitGoal
  const burned = today?.adjustedExpenditure ?? null
  const eaten = today?.adjustedIntake ?? null

  const current = burned === null || eaten === null ? null : burned - eaten
  const remaining = current === null ? null : Math.max(0, goal - current)
  const progress = current === null ? null : Math.max(0, Math.min(1, current / goal))

  return {
    goal,
    current,
    remaining,
    progress,
    met: current !== null && current >= goal,
    burnedSoFar: burned,
    // Divided by the intake factor, because the budget is what the food label
    // will say, not what the model will count it as.
    intakeBudget:
      burned === null ? null : Math.max(0, (burned - goal) / settings.intakeAdjustmentFactor),
  }
}

/** kcal per minute, and where the figure came from. */
export interface BurnRate {
  perMinute: number
  /** 'personal' when derived from logged sessions, 'reference' when not. */
  basis: 'personal' | 'reference'
  /** Sessions behind a personal rate. */
  sessions: number
}

/**
 * Reference rates, used only for activity types with no logged history.
 *
 * Derived from standard MET values at 77 kg (the owner's starting weight),
 * using kcal/min = MET x 3.5 x kg / 200. Running 9.8 MET, cycling 8.0,
 * swimming 8.3, strength 5.0, climbing 8.0, hiking 6.0, cardio 7.0,
 * walking 3.5. These are population averages and will be wrong for any
 * individual, which is exactly why a personal rate replaces them the moment
 * one session exists.
 */
const REFERENCE_KCAL_PER_MIN: Record<ActivityType, number> = {
  running: 13.2,
  cycling: 10.8,
  swimming: 11.2,
  strength: 6.7,
  climbing: 10.8,
  hiking: 8.1,
  cardio: 9.4,
  walking: 4.7,
  other: 7.0,
}

/** Sessions shorter than this are warm-ups or mis-logs, not evidence of a rate. */
const MIN_SESSION_MINUTES = 5

/**
 * The owner's own kcal/min for an activity type.
 *
 * Totals are summed and divided once rather than averaging each session's rate,
 * so a 90 minute session counts for more than a 6 minute one. Averaging the
 * per-session rates would let a single short, intense effort dominate.
 */
export function burnRate(activities: Activity[], type: ActivityType): BurnRate {
  let minutes = 0
  let kcal = 0
  let sessions = 0

  for (const a of activities) {
    if (a.activityType !== type) continue
    if (a.calories === null || a.calories <= 0) continue
    const mins = a.durationSeconds / 60
    if (mins < MIN_SESSION_MINUTES) continue
    minutes += mins
    kcal += a.calories
    sessions += 1
  }

  if (sessions === 0 || minutes <= 0) {
    return { perMinute: REFERENCE_KCAL_PER_MIN[type], basis: 'reference', sessions: 0 }
  }
  return { perMinute: kcal / minutes, basis: 'personal', sessions }
}

export interface Suggestion {
  type: ActivityType
  /** Whole minutes, rounded up to a multiple of 5 so it reads as a plan. */
  minutes: number
  /** Estimated kcal for that duration at this rate. */
  kcal: number
  rate: BurnRate
}

/** Round to something a person would actually set out to do. */
function roundMinutes(raw: number): number {
  if (raw <= 0) return 0
  return Math.max(5, Math.ceil(raw / 5) * 5)
}

/**
 * Options that would close `remaining` kcal, cheapest in time first.
 *
 * Only types the owner has actually done are offered when any history exists.
 * Suggesting a swim to someone who has never logged one is a template talking,
 * not a dashboard.
 */
export function suggestions(
  remaining: number,
  activities: Activity[],
  opts: { max?: number; maxMinutes?: number } = {},
): Suggestion[] {
  const { max = 3, maxMinutes = 120 } = opts
  if (!Number.isFinite(remaining) || remaining <= 0) return []

  const logged = new Set(activities.map((a) => a.activityType))
  const candidates: ActivityType[] =
    logged.size > 0
      ? [...logged]
      : (['running', 'strength', 'cycling'] as ActivityType[])

  const out: Suggestion[] = []
  for (const type of candidates) {
    const rate = burnRate(activities, type)
    if (rate.perMinute <= 0) continue
    const minutes = roundMinutes(remaining / rate.perMinute)
    // A four-hour walk is arithmetically true and useless as a suggestion.
    if (minutes > maxMinutes) continue
    out.push({ type, minutes, kcal: Math.round(minutes * rate.perMinute), rate })
  }

  out.sort((a, b) => a.minutes - b.minutes || a.type.localeCompare(b.type))
  return out.slice(0, max)
}

/**
 * Steps that would cover the gap, or null when the figure is implausible.
 *
 * Walking burn per step scales with body mass. 0.045 kcal/step is the common
 * approximation for an adult around 77 kg; it is a reference figure, not a
 * measurement, and is treated as one.
 */
export function stepsToClose(remaining: number, maxSteps = 25000): number | null {
  if (!Number.isFinite(remaining) || remaining <= 0) return null
  const steps = Math.ceil(remaining / 0.045 / 500) * 500
  return steps > maxSteps ? null : steps
}

/** What one suggestion is worth as a share of the whole mission. */
export function shareOfMission(kcal: number, missionTarget: number): number {
  if (missionTarget <= 0) return 0
  return (kcal / missionTarget) * 100
}
