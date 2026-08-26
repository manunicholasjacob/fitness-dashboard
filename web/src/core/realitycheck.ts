/**
 * Adaptive reality check.
 *
 * The 0.85 and 1.10 factors are planning assumptions, not measurements. This
 * module compares what the calorie model *predicted* you would lose against
 * what the scale actually did, and reports the gap.
 *
 * It deliberately does NOT rewrite your correction factors. An automatic
 * feedback loop between a noisy scale and the model that grades it is how you
 * end up chasing water weight. It surfaces the discrepancy and a suggested
 * factor, and you decide.
 */

import type { BodyEntry, ComputedDay, Settings } from './types'
import { weightPoints } from './body'
import { kgToLb } from './units'
import { linearFit, rollingAverage, type Point } from './trend'

export type ModelVerdict = 'overestimating' | 'underestimating' | 'aligned' | 'insufficient-data'

export interface RealityCheck {
  verdict: ModelVerdict
  windowDays: number
  /** Pounds the cumulative adjusted deficit implies over the window. */
  predictedLossLb: number | null
  /** Pounds the smoothed scale trend actually shows over the window. */
  observedLossLb: number | null
  /** predicted - observed. Positive means the model is optimistic. */
  differenceLb: number | null
  /** Confidence in the observed weight trend line, 0 to 1. */
  trendR2: number | null
  /**
   * The single multiplier on the daily balance that would have reconciled the
   * model with the scale. A suggestion for the settings page, never applied.
   */
  impliedBalanceScalar: number | null
  completeDaysInWindow: number
  message: string
}

const MIN_COMPLETE_DAYS = 7
const MIN_WEIGH_INS = 5
/** Below roughly a pound, scale noise dominates and the comparison is meaningless. */
const NOISE_FLOOR_LB = 0.9

export function realityCheck(
  days: ComputedDay[],
  entries: BodyEntry[],
  settings: Settings,
  windowDays = 28,
): RealityCheck {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const windowDaysData = days.filter((d) => d.date >= cutoffIso && d.isComplete)
  const windowWeights = weightPoints(entries).filter((w) => w.date >= cutoffIso)

  const base: RealityCheck = {
    verdict: 'insufficient-data',
    windowDays,
    predictedLossLb: null,
    observedLossLb: null,
    differenceLb: null,
    trendR2: null,
    impliedBalanceScalar: null,
    completeDaysInWindow: windowDaysData.length,
    message: '',
  }

  if (windowDaysData.length < MIN_COMPLETE_DAYS || windowWeights.length < MIN_WEIGH_INS) {
    return {
      ...base,
      message:
        `Needs ${MIN_COMPLETE_DAYS} complete energy days and ${MIN_WEIGH_INS} weigh-ins in the last ` +
        `${windowDays} days. Currently ${windowDaysData.length} and ${windowWeights.length}.`,
    }
  }

  const cumulative = windowDaysData.reduce((s, d) => s + (d.adjustedBalance ?? 0), 0)
  const predictedLossLb = cumulative / settings.caloriesPerPound

  // Fit the trend line to the smoothed series so one bad morning cannot swing it.
  const points: Point[] = windowWeights.map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))
  const smoothed = rollingAverage(points, Math.min(7, points.length))
    .map((p) => ({ date: p.date, value: p.average ?? p.value }))

  const fit = linearFit(smoothed)
  if (!fit) return { ...base, predictedLossLb, message: 'Not enough spread in weigh-in dates to fit a trend.' }

  const spanDays =
    (Date.parse(smoothed[smoothed.length - 1].date) - Date.parse(smoothed[0].date)) / 86_400_000
  // Negative slope means losing weight, so flip the sign to express it as a loss.
  const observedLossLb = -fit.slope * spanDays
  const differenceLb = predictedLossLb - observedLossLb

  let verdict: ModelVerdict
  if (Math.abs(differenceLb) < NOISE_FLOOR_LB) verdict = 'aligned'
  else if (differenceLb > 0) verdict = 'overestimating'
  else verdict = 'underestimating'

  const impliedBalanceScalar =
    predictedLossLb !== 0 ? observedLossLb / predictedLossLb : null

  const messages: Record<ModelVerdict, string> = {
    aligned:
      'The calorie model and the scale agree within normal measurement noise. No change needed.',
    overestimating:
      'The model predicts more loss than the scale shows. Garmin may be generous, intake may be ' +
      'under-logged, or the window is too short. Consider a lower Garmin factor or a higher intake factor.',
    underestimating:
      'The scale shows more loss than the model predicts. Your true deficit may be larger than ' +
      'estimated, or recent water loss is flattering the trend.',
    'insufficient-data': '',
  }

  return {
    verdict,
    windowDays,
    predictedLossLb,
    observedLossLb,
    differenceLb,
    trendR2: fit.r2,
    impliedBalanceScalar,
    completeDaysInWindow: windowDaysData.length,
    message: messages[verdict],
  }
}
