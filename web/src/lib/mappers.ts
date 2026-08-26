/**
 * Row mappers.
 *
 * Postgres speaks snake_case and TypeScript speaks camelCase. Keeping the
 * translation in one place means the rest of the app never sees a raw row, and
 * a column rename has exactly one blast radius.
 */

import type { Activity, ActivityType, BodyEntry, DailyRecord, DataSource, Settings } from '../core/types'
import { DEFAULT_SETTINGS } from '../core/settings'

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

// --- Daily metrics -----------------------------------------------------------

export function toDailyRecord(row: Record<string, unknown>): DailyRecord {
  return {
    date: String(row.date).slice(0, 10),
    rawGarminTotalCalories: num(row.raw_garmin_total_calories),
    rawGarminActiveCalories: num(row.raw_garmin_active_calories),
    rawGarminRestingCalories: num(row.raw_garmin_resting_calories),
    rawMfpCalories: num(row.raw_mfp_calories),
    protein: num(row.protein),
    carbs: num(row.carbs),
    fat: num(row.fat),
    fiber: num(row.fiber),
    sugar: num(row.sugar),
    sodium: num(row.sodium),
    stepsTotal: num(row.steps_total),
    stepsBeforeDeadline: num(row.steps_before_deadline),
    morningGoalMetAt: str(row.morning_goal_met_at),
    distanceMeters: num(row.distance_meters),
    activeMinutes: num(row.active_minutes),
    intensityMinutes: num(row.intensity_minutes),
    floorsClimbed: num(row.floors_climbed),
    averageHr: num(row.average_hr),
    restingHr: num(row.resting_hr),
    maxHr: num(row.max_hr),
    sleepSeconds: num(row.sleep_seconds),
    sleepDeepSeconds: num(row.sleep_deep_seconds),
    sleepRemSeconds: num(row.sleep_rem_seconds),
    sleepScore: num(row.sleep_score),
    stressAvg: num(row.stress_avg),
    bodyBatteryHigh: num(row.body_battery_high),
    bodyBatteryLow: num(row.body_battery_low),
    spo2Avg: num(row.spo2_avg),
    respirationAvg: num(row.respiration_avg),
    energySource: (str(row.energy_source) as DataSource | null) ?? null,
    nutritionSource: (str(row.nutrition_source) as DataSource | null) ?? null,
    isDemo: Boolean(row.is_demo),
  }
}

/** Nutrition half of a daily row, for manual entry. Omits untouched columns. */
export function nutritionPayload(input: {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sugar: number | null
}) {
  return {
    raw_mfp_calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: input.fiber,
    sugar: input.sugar,
    nutrition_source: 'manual' as const,
  }
}

// --- Body entries ------------------------------------------------------------

export function toBodyEntry(row: Record<string, unknown>): BodyEntry {
  return {
    date: String(row.date).slice(0, 10),
    weightKg: num(row.weight_kg),
    waistCm: num(row.waist_cm),
    neckCm: num(row.neck_cm),
    hipCm: num(row.hip_cm),
    planningBodyFatOverride: num(row.planning_body_fat_override),
    notes: str(row.notes),
    source: (str(row.source) as DataSource) ?? 'manual',
  }
}

export function fromBodyEntry(entry: Partial<BodyEntry> & { date: string }) {
  return {
    date: entry.date,
    weight_kg: entry.weightKg ?? null,
    waist_cm: entry.waistCm ?? null,
    neck_cm: entry.neckCm ?? null,
    hip_cm: entry.hipCm ?? null,
    planning_body_fat_override: entry.planningBodyFatOverride ?? null,
    notes: entry.notes ?? null,
    source: entry.source ?? 'manual',
  }
}

// --- Activities --------------------------------------------------------------

export function toActivity(row: Record<string, unknown>): Activity {
  return {
    id: String(row.id),
    externalSource: (str(row.external_source) as DataSource) ?? 'manual',
    externalId: str(row.external_id),
    activityType: (str(row.activity_type) as ActivityType) ?? 'other',
    rawActivityType: str(row.raw_activity_type),
    startTime: String(row.start_time),
    durationSeconds: num(row.duration_seconds) ?? 0,
    distanceMeters: num(row.distance_meters),
    calories: num(row.calories),
    averageHr: num(row.average_hr),
    maxHr: num(row.max_hr),
    averageSpeedMps: num(row.average_speed_mps),
    cadence: num(row.cadence),
    runningPower: num(row.running_power),
    elevationGainMeters: num(row.elevation_gain_meters),
    trainingLoad: num(row.training_load),
    aerobicTrainingEffect: num(row.aerobic_training_effect),
    notes: str(row.notes),
  }
}

// --- Settings ----------------------------------------------------------------

export function toSettings(row: Record<string, unknown> | null): Settings {
  if (!row) return DEFAULT_SETTINGS
  return {
    displayName: str(row.display_name) ?? DEFAULT_SETTINGS.displayName,
    sex: (str(row.sex) as Settings['sex']) ?? 'male',
    heightCm: num(row.height_cm) ?? DEFAULT_SETTINGS.heightCm,
    timezone: str(row.timezone) ?? DEFAULT_SETTINGS.timezone,
    startDate: String(row.start_date ?? DEFAULT_SETTINGS.startDate).slice(0, 10),
    startingWeightKg: num(row.starting_weight_kg) ?? DEFAULT_SETTINGS.startingWeightKg,
    targetWeightKg: num(row.target_weight_kg) ?? DEFAULT_SETTINGS.targetWeightKg,
    startingBodyFatPercent: num(row.starting_body_fat_percent) ?? 20,
    targetBodyFatMin: num(row.target_body_fat_min) ?? 10,
    targetBodyFatMax: num(row.target_body_fat_max) ?? 12,
    caloriesPerPound: num(row.calories_per_pound) ?? 3500,
    missionBufferPercent: num(row.mission_buffer_percent) ?? 20,
    missionTargetOverride: num(row.mission_target_override),
    garminAdjustmentFactor: num(row.garmin_adjustment_factor) ?? 0.85,
    intakeAdjustmentFactor: num(row.intake_adjustment_factor) ?? 1.1,
    morningStepGoal: num(row.morning_step_goal) ?? 7000,
    // Postgres returns 'HH:MM:SS'; the UI works in 'HH:MM'.
    morningDeadline: (str(row.morning_deadline) ?? '09:00').slice(0, 5),
    proteinTarget: num(row.protein_target),
    carbsTarget: num(row.carbs_target),
    fatTarget: num(row.fat_target),
    fiberTarget: num(row.fiber_target),
    units: (str(row.units) as Settings['units']) ?? 'imperial',
    lengthUnits: (str(row.length_units) as Settings['units']) ?? 'metric',
    startingWaistCm: num(row.starting_waist_cm) ?? 87,
    startingNeckCm: num(row.starting_neck_cm) ?? 40,
  }
}

export function fromSettings(s: Settings) {
  return {
    display_name: s.displayName,
    sex: s.sex,
    height_cm: s.heightCm,
    timezone: s.timezone,
    start_date: s.startDate,
    starting_weight_kg: s.startingWeightKg,
    target_weight_kg: s.targetWeightKg,
    starting_body_fat_percent: s.startingBodyFatPercent,
    target_body_fat_min: s.targetBodyFatMin,
    target_body_fat_max: s.targetBodyFatMax,
    calories_per_pound: s.caloriesPerPound,
    mission_buffer_percent: s.missionBufferPercent,
    mission_target_override: s.missionTargetOverride,
    garmin_adjustment_factor: s.garminAdjustmentFactor,
    intake_adjustment_factor: s.intakeAdjustmentFactor,
    morning_step_goal: s.morningStepGoal,
    morning_deadline: s.morningDeadline,
    protein_target: s.proteinTarget,
    carbs_target: s.carbsTarget,
    fat_target: s.fatTarget,
    fiber_target: s.fiberTarget,
    units: s.units,
    length_units: s.lengthUnits,
    starting_waist_cm: s.startingWaistCm,
    starting_neck_cm: s.startingNeckCm,
  }
}

// --- Sync logs ---------------------------------------------------------------

export interface SyncLog {
  provider: 'garmin' | 'mfp'
  startedAt: string
  completedAt: string | null
  status: 'running' | 'success' | 'partial' | 'failed'
  recordsImported: number
  errorMessage: string | null
}

export function toSyncLog(row: Record<string, unknown>): SyncLog {
  return {
    provider: str(row.provider) as SyncLog['provider'],
    startedAt: String(row.started_at),
    completedAt: str(row.completed_at),
    status: (str(row.status) as SyncLog['status']) ?? 'failed',
    recordsImported: num(row.records_imported) ?? 0,
    errorMessage: str(row.error_message),
  }
}
