/**
 * Body composition.
 *
 * The Navy circumference estimate and the planning body-fat figure are kept as
 * two separate numbers on purpose. The Navy formula has a real standard error
 * of roughly +/-3 percentage points, so it is treated as an independent
 * estimate to compare against, never as ground truth that overwrites planning.
 */

import type { BodyEntry, Sex, WeightPoint } from './types'

export interface BodyComposition {
  navyBodyFatPercent: number | null
  planningBodyFatPercent: number
  fatMassKg: number | null
  leanMassKg: number | null
  /** Gap between the two estimates, in percentage points. */
  estimateSpread: number | null
}

/**
 * U.S. Navy circumference body-fat estimate. All inputs in centimetres.
 *
 * Male:   495 / (1.0324 - 0.19077*log10(waist - neck) + 0.15456*log10(height)) - 450
 * Female: 495 / (1.29579 - 0.35004*log10(waist + hip - neck) + 0.22100*log10(height)) - 450
 */
export function navyBodyFat(
  sex: Sex,
  heightCm: number,
  waistCm: number | null,
  neckCm: number | null,
  hipCm: number | null = null,
): number | null {
  if (!waistCm || !neckCm || !heightCm) return null

  let value: number
  if (sex === 'male') {
    const girth = waistCm - neckCm
    if (girth <= 0) return null
    value =
      495 /
        (1.0324 - 0.19077 * Math.log10(girth) + 0.15456 * Math.log10(heightCm)) -
      450
  } else {
    if (!hipCm) return null
    const girth = waistCm + hipCm - neckCm
    if (girth <= 0) return null
    value =
      495 /
        (1.29579 - 0.35004 * Math.log10(girth) + 0.221 * Math.log10(heightCm)) -
      450
  }

  if (!Number.isFinite(value) || value <= 0 || value >= 75) return null
  return value
}

export function bodyComposition(
  sex: Sex,
  heightCm: number,
  weightKg: number | null,
  waistCm: number | null,
  neckCm: number | null,
  planningBodyFatPercent: number,
  hipCm: number | null = null,
): BodyComposition {
  const navy = navyBodyFat(sex, heightCm, waistCm, neckCm, hipCm)
  // Mass split uses the Navy estimate when we have one, since it reflects the
  // actual measurements; planning BF is the fallback for un-measured weeks.
  const basis = navy ?? planningBodyFatPercent
  const fatMassKg = weightKg !== null ? (weightKg * basis) / 100 : null
  const leanMassKg = weightKg !== null && fatMassKg !== null ? weightKg - fatMassKg : null

  return {
    navyBodyFatPercent: navy,
    planningBodyFatPercent,
    fatMassKg,
    leanMassKg,
    estimateSpread: navy !== null ? navy - planningBodyFatPercent : null,
  }
}

/** Enrich stored check-ins with their derived composition. */
export function computeMeasurements(
  entries: BodyEntry[],
  sex: Sex,
  heightCm: number,
  defaultPlanningBodyFat: number,
): (BodyEntry & BodyComposition)[] {
  return entries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({
      ...m,
      ...bodyComposition(
        sex,
        heightCm,
        m.weightKg,
        m.waistCm,
        m.neckCm,
        m.planningBodyFatOverride ?? defaultPlanningBodyFat,
        m.hipCm,
      ),
    }))
}

/**
 * Pull the dated weights out of a check-in list.
 *
 * Check-ins are sparse by design (waist one day, weight the next), so every
 * trend calculation filters to the field it actually needs rather than
 * assuming a complete row.
 */
export function weightPoints(entries: BodyEntry[]): WeightPoint[] {
  return entries
    .filter((e): e is BodyEntry & { weightKg: number } => e.weightKg !== null && Number.isFinite(e.weightKg))
    .map((e) => ({ date: e.date, weightKg: e.weightKg }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Latest non-null value of a given measurement, with the date it was taken. */
export function latestMeasurement(
  entries: BodyEntry[],
  field: 'weightKg' | 'waistCm' | 'neckCm' | 'hipCm',
): { date: string; value: number } | null {
  const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date))
  for (const e of sorted) {
    const v = e[field]
    if (v !== null && Number.isFinite(v)) return { date: e.date, value: v }
  }
  return null
}
