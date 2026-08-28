/**
 * Settings defaults and validation.
 *
 * The mission target is *derived* from weight goals rather than stored as a
 * magic 84,000, so changing the target weight recalculates the mission. The
 * override field exists for when you want to pin a number regardless.
 */

import { z } from 'zod'
import type { Settings } from './types'
import { lbToKg } from './units'

export const settingsSchema = z.object({
  displayName: z.string().min(1).max(40),
  sex: z.enum(['male', 'female']),
  heightCm: z.number().positive().max(272),
  timezone: z.string().min(1),

  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startingWeightKg: z.number().positive().max(500),
  targetWeightKg: z.number().positive().max(500),
  startingBodyFatPercent: z.number().min(1).max(70),
  targetBodyFatMin: z.number().min(1).max(70),
  targetBodyFatMax: z.number().min(1).max(70),
  caloriesPerPound: z.number().positive().max(10000),
  missionBufferPercent: z.number().min(0).max(200),
  missionTargetOverride: z.number().positive().nullable(),

  // Guard rails, not opinions: a factor outside these bounds is a typo.
  garminAdjustmentFactor: z.number().min(0.3).max(1.5),
  intakeAdjustmentFactor: z.number().min(0.5).max(2),

  // The per-day deficit the "close the gap" suggestions aim at. 500 kcal/day
  // is the conventional figure for a pound a week, which is where it starts.
  dailyDeficitGoal: z.number().int().min(100).max(3000),

  morningStepGoal: z.number().int().min(100).max(100000),
  morningDeadline: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),

  proteinTarget: z.number().min(0).max(1000).nullable(),
  carbsTarget: z.number().min(0).max(2000).nullable(),
  fatTarget: z.number().min(0).max(1000).nullable(),
  fiberTarget: z.number().min(0).max(300).nullable(),

  units: z.enum(['imperial', 'metric']),
  lengthUnits: z.enum(['imperial', 'metric']),
  unlockPinHash: z.string().nullable(),
  startingWaistCm: z.number().positive().max(300),
  startingNeckCm: z.number().positive().max(100),
})

/**
 * Manu's starting baseline.
 *
 * 170 lb -> 150 lb is 20 lb, at 3,500 kcal/lb that is 70,000 kcal, and the 20%
 * uncertainty buffer brings the mission to exactly 84,000 kcal.
 */
export const DEFAULT_SETTINGS: Settings = {
  displayName: 'Manu',
  sex: 'male',
  heightCm: 170,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',

  startDate: new Date().toISOString().slice(0, 10),
  startingWeightKg: lbToKg(170),
  targetWeightKg: lbToKg(150),
  startingBodyFatPercent: 20,
  targetBodyFatMin: 10,
  targetBodyFatMax: 12,
  caloriesPerPound: 3500,
  missionBufferPercent: 20,
  missionTargetOverride: null,

  // 1.0: no correction. Garmin's expenditure is taken as reported.
  //
  // This was 0.85, then 0.90, on the theory that wrist-based estimates are
  // generous. The theory may well be right, but a factor nobody can calibrate
  // is a second source of error stacked on the first, and it made every figure
  // in the app an estimate of an estimate. The Mission page's model check still
  // reports the multiplier that would reconcile predicted loss against the
  // scale, so the correction can come back with evidence behind it.
  garminAdjustmentFactor: 1,
  intakeAdjustmentFactor: 1.1,

  dailyDeficitGoal: 500,
  morningStepGoal: 7000,
  morningDeadline: '09:00',

  proteinTarget: 150,
  carbsTarget: null,
  fatTarget: null,
  fiberTarget: 30,

  units: 'imperial',
  lengthUnits: 'metric',
  unlockPinHash: null,
  startingWaistCm: 87,
  startingNeckCm: 40,
}

/** Merge a partial row from the database over the defaults. */
export function withDefaults(partial: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) }
}
