/**
 * Domain types for the energy-deficit mission.
 *
 * Invariant that the whole app rests on: a `DailyRecord` holds ONLY raw values
 * as reported by Garmin, MyFitnessPal, or the user. Every adjusted or derived
 * figure is computed on demand by the functions in this package. Changing an
 * adjustment factor in settings therefore reprices all of history instantly and
 * without mutating a single stored row.
 */

export type UnitSystem = 'imperial' | 'metric'
export type Sex = 'male' | 'female'

export type DataSource = 'garmin' | 'mfp' | 'manual' | 'import' | 'demo'

/** Raw, never-overwritten daily source data. One row per calendar date. */
export interface DailyRecord {
  date: string // ISO yyyy-mm-dd in the user's configured timezone

  // --- Raw Garmin energy ---
  rawGarminTotalCalories: number | null
  rawGarminActiveCalories: number | null
  rawGarminRestingCalories: number | null

  // --- Raw MyFitnessPal nutrition ---
  rawMfpCalories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sugar: number | null
  sodium: number | null

  // --- Raw Garmin activity ---
  stepsTotal: number | null
  stepsBeforeDeadline: number | null
  morningGoalMetAt: string | null // ISO timestamp the goal was crossed
  distanceMeters: number | null
  activeMinutes: number | null
  intensityMinutes: number | null
  floorsClimbed: number | null

  // --- Raw Garmin health ---
  averageHr: number | null
  restingHr: number | null
  maxHr: number | null
  sleepSeconds: number | null
  sleepDeepSeconds: number | null
  sleepRemSeconds: number | null
  sleepScore: number | null
  stressAvg: number | null
  bodyBatteryHigh: number | null
  bodyBatteryLow: number | null
  spo2Avg: number | null
  respirationAvg: number | null

  energySource: DataSource | null
  nutritionSource: DataSource | null
  isDemo: boolean
}

/**
 * One body check-in. Every field except the date is optional, so the daily
 * flow can be "weight and waist, done" while neck, hips and notes are filled
 * in only when you feel like it.
 */
export interface BodyEntry {
  date: string
  weightKg: number | null
  waistCm: number | null
  neckCm: number | null
  hipCm: number | null
  planningBodyFatOverride: number | null
  notes: string | null
  source: DataSource
}

/** Narrow a check-in list to the dates that actually carry a weight. */
export interface WeightPoint {
  date: string
  weightKg: number
}

export type ActivityType =
  | 'running' | 'walking' | 'cycling' | 'swimming'
  | 'strength' | 'climbing' | 'hiking' | 'cardio' | 'other'

export interface Activity {
  id: string
  externalSource: DataSource
  externalId: string | null
  activityType: ActivityType
  rawActivityType: string | null
  startTime: string // ISO timestamp
  durationSeconds: number
  distanceMeters: number | null
  calories: number | null
  averageHr: number | null
  maxHr: number | null
  averageSpeedMps: number | null
  cadence: number | null
  runningPower: number | null
  elevationGainMeters: number | null
  trainingLoad: number | null
  aerobicTrainingEffect: number | null
  notes: string | null
}

export interface Settings {
  displayName: string
  sex: Sex
  heightCm: number
  timezone: string

  // Mission definition
  startDate: string
  startingWeightKg: number
  targetWeightKg: number
  startingBodyFatPercent: number
  targetBodyFatMin: number
  targetBodyFatMax: number
  caloriesPerPound: number
  missionBufferPercent: number
  /** When null the mission target is derived from the fields above. */
  missionTargetOverride: number | null

  // Adjustment assumptions
  garminAdjustmentFactor: number
  intakeAdjustmentFactor: number

  // Morning mission
  morningStepGoal: number
  morningDeadline: string // 'HH:MM' local

  // Macro targets (grams); null means untracked
  proteinTarget: number | null
  carbsTarget: number | null
  fatTarget: number | null
  fiberTarget: number | null

  // Display. Weight/distance and circumference units are separate because a
  // 170 lb + 87 cm baseline is a completely normal way to actually measure.
  units: UnitSystem
  lengthUnits: UnitSystem

  /**
   * SHA-256 of the device unlock code, or null for no lock screen.
   * A convenience lock only: real access control is Supabase Auth plus RLS.
   */
  unlockPinHash: string | null
  startingWaistCm: number
  startingNeckCm: number
}

/** A fully-derived day, ready to render. Never persisted. */
export interface ComputedDay {
  date: string
  raw: DailyRecord
  /** Raw Garmin total, or null when no energy data exists for the day. */
  rawExpenditure: number | null
  adjustedExpenditure: number | null
  rawIntake: number | null
  adjustedIntake: number | null
  /** Positive means deficit, negative means surplus. Null when incomplete. */
  adjustedBalance: number | null
  /** True when both sides of the equation are present. */
  isComplete: boolean
  morningMissionMet: boolean | null
}
