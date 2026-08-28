import type { ComputedDay, Settings } from './types'
import { missionTarget } from './energy'

/**
 * The game layer.
 *
 * Everything here is derived from figures the app already holds. No points are
 * invented, no multipliers are applied, and nothing is awarded for opening the
 * app. A rank is a restatement of cumulative deficit; a milestone is a real
 * threshold in kcal; a streak counts days that actually met the goal.
 *
 * If the arithmetic underneath cannot flatter, the game cannot either, which is
 * the only way a progress game is worth playing against your own body.
 */

/** kcal in one theoretical pound, from settings so the two never diverge. */
function perPound(settings: Settings): number {
  return settings.caloriesPerPound > 0 ? settings.caloriesPerPound : 3500
}

export interface Rank {
  /** 1-based. Level 1 is the start, before the first pound. */
  level: number
  name: string
  /** kcal at which this level began. */
  floor: number
  /** kcal at which the next level begins. Null at the top. */
  ceiling: number | null
  /** Progress through the current level, 0-1. */
  progress: number
  /** kcal still needed to reach the next level. Null at the top. */
  toNext: number | null
}

/**
 * Rank names, one per theoretical pound.
 *
 * Named for the distance actually covered rather than for metals or military
 * tiers, because the whole point is that the number means something physical.
 * The list runs one past the mission so finishing lands on a name.
 */
const RANK_NAMES = [
  'Starting out',
  'First pound',
  'Two down',
  'Three down',
  'Four down',
  'Five down',
  'Six down',
  'Seven down',
  'Half a stone',
  'Nine down',
  'Ten down',
  'Eleven down',
  'Twelve down',
  'One stone',
  'Fourteen down',
  'Fifteen down',
  'Sixteen down',
  'Seventeen down',
  'Eighteen down',
  'Nineteen down',
  'Twenty down',
  'Twenty-one down',
  'Twenty-two down',
  'Twenty-three down',
  'Mission complete',
]

export function rank(accumulated: number, settings: Settings): Rank {
  const step = perPound(settings)
  const banked = Math.max(0, accumulated)
  const index = Math.min(RANK_NAMES.length - 1, Math.floor(banked / step))
  const isTop = index === RANK_NAMES.length - 1

  const floor = index * step
  const ceiling = isTop ? null : (index + 1) * step

  return {
    level: index + 1,
    name: RANK_NAMES[index],
    floor,
    ceiling,
    progress: isTop ? 1 : Math.max(0, Math.min(1, (banked - floor) / step)),
    toNext: ceiling === null ? null : Math.max(0, ceiling - banked),
  }
}

export interface Milestone {
  /** kcal threshold. */
  at: number
  label: string
  reached: boolean
  /** True for the nearest one not yet reached. */
  next: boolean
}

/**
 * The mission as a row of thresholds rather than one distant number.
 *
 * 84,000 is not a distance anyone can feel. A pound is. The markers sit at
 * every theoretical pound, which for a 24 lb mission gives 24 of them: close
 * enough together that one is always in reach, sparse enough to read as a
 * track rather than a bar.
 */
export function milestones(accumulated: number, settings: Settings): Milestone[] {
  const step = perPound(settings)
  const target = missionTarget(settings)
  const count = Math.max(1, Math.min(60, Math.round(target / step)))

  const out: Milestone[] = []
  let foundNext = false
  for (let i = 1; i <= count; i += 1) {
    const at = i * step
    const reached = accumulated >= at
    const next = !reached && !foundNext
    if (next) foundNext = true
    out.push({ at, label: `${i} lb`, reached, next })
  }
  return out
}

export interface Streak {
  /** Consecutive goal-meeting days ending at the most recent finished day. */
  current: number
  /** Longest run anywhere in the record. */
  best: number
  /** Days that met the goal. */
  totalMet: number
  /** Days with both sides logged, and so judgeable at all. */
  totalJudged: number
}

/**
 * Days that met the daily deficit goal, in a row.
 *
 * An incomplete day breaks the streak rather than being skipped. Skipping would
 * let a run of unlogged days masquerade as consistency, which is precisely the
 * lie to avoid in a tracker whose main failure mode is not logging.
 *
 * Today is excluded by date, because a day still accumulating is not a day that
 * failed.
 */
export function streak(days: ComputedDay[], settings: Settings, todayIso: string): Streak {
  const goal = settings.dailyDeficitGoal
  const sorted = days
    .filter((d) => d.date !== todayIso)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  let best = 0
  let run = 0
  let totalMet = 0
  let totalJudged = 0

  for (const d of sorted) {
    if (!d.isComplete || d.adjustedBalance === null) {
      run = 0
      continue
    }
    totalJudged += 1
    if (d.adjustedBalance >= goal) {
      run += 1
      totalMet += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }

  // Whatever run survives to the end of the record is the live one.
  return { current: run, best, totalMet, totalJudged }
}

export interface RingSpec {
  key: 'deficit' | 'morning' | 'protein'
  label: string
  /** 0-1, clamped. */
  progress: number
  /** Current over target, already formatted. */
  readout: string
  /** True once the target is reached. */
  closed: boolean
  /** False when there is no reading yet, so the ring renders as unstarted. */
  known: boolean
}

/**
 * The three rings.
 *
 * Deficit is the mission's own currency. Morning is the habit with a deadline
 * on it. Protein is the one macro that protects muscle while in a deficit, and
 * the only one with a target already in settings; its ring is omitted entirely
 * when no target is set, rather than drawn permanently empty.
 */
export function rings(
  today: ComputedDay | undefined,
  settings: Settings,
  morningSteps: number | null,
): RingSpec[] {
  const out: RingSpec[] = []

  const balance = today?.adjustedBalance ?? null
  out.push({
    key: 'deficit',
    label: 'Deficit',
    progress: balance === null ? 0 : clamp01(balance / settings.dailyDeficitGoal),
    readout:
      balance === null
        ? `-- / ${settings.dailyDeficitGoal}`
        : `${Math.round(balance)} / ${settings.dailyDeficitGoal}`,
    closed: balance !== null && balance >= settings.dailyDeficitGoal,
    known: balance !== null,
  })

  out.push({
    key: 'morning',
    label: 'Morning',
    progress: morningSteps === null ? 0 : clamp01(morningSteps / settings.morningStepGoal),
    readout:
      morningSteps === null
        ? `-- / ${settings.morningStepGoal}`
        : `${Math.round(morningSteps)} / ${settings.morningStepGoal}`,
    closed: morningSteps !== null && morningSteps >= settings.morningStepGoal,
    known: morningSteps !== null,
  })

  const target = settings.proteinTarget
  if (target !== null && target > 0) {
    const protein = today?.raw.protein ?? null
    out.push({
      key: 'protein',
      label: 'Protein',
      progress: protein === null ? 0 : clamp01(protein / target),
      readout: protein === null ? `-- / ${target} g` : `${Math.round(protein)} / ${target} g`,
      closed: protein !== null && protein >= target,
      known: protein !== null,
    })
  }

  return out
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}
