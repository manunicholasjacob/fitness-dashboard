import { describe, expect, it } from 'vitest'
import {
  adjustExpenditure,
  adjustIntake,
  computeDay,
  computeDays,
  cumulativeBalance,
  cumulativeSeries,
  missionProgress,
  missionTarget,
  projectMissionCompletion,
} from './energy'
import { DEFAULT_SETTINGS } from './settings'
import { bodyComposition, navyBodyFat } from './body'
import { linearFit, rollingAverage, trendChange } from './trend'
import { minutesUntilDeadline, morningStats } from './morning'
import { normalizeActivityType, resolveRange, runningStats, summarize, workoutStreak } from './activity'
import { realityCheck } from './realitycheck'
import { formatPace, kgToLb, lbToKg } from './units'
import type { Activity, BodyEntry, DailyRecord, Settings } from './types'

// Pinned to the factors the specification's worked examples are written in,
// so changing the shipped default never silently rewrites what they assert.
const S: Settings = {
  ...DEFAULT_SETTINGS,
  startDate: '2026-01-01',
  garminAdjustmentFactor: 0.85,
  intakeAdjustmentFactor: 1.1,
}

function day(date: string, garmin: number | null, mfp: number | null, extra: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    rawGarminTotalCalories: garmin,
    rawGarminActiveCalories: null,
    rawGarminRestingCalories: null,
    rawMfpCalories: mfp,
    protein: null, carbs: null, fat: null, fiber: null, sugar: null, sodium: null,
    stepsTotal: null, stepsBeforeDeadline: null, morningGoalMetAt: null,
    distanceMeters: null, activeMinutes: null, intensityMinutes: null, floorsClimbed: null,
    averageHr: null, restingHr: null, maxHr: null,
    sleepSeconds: null, sleepDeepSeconds: null, sleepRemSeconds: null, sleepScore: null,
    stressAvg: null, bodyBatteryHigh: null, bodyBatteryLow: null, spo2Avg: null, respirationAvg: null,
    garminDataThrough: null,
    energySource: garmin === null ? null : 'garmin',
    nutritionSource: mfp === null ? null : 'mfp',
    isDemo: false,
    ...extra,
  }
}

describe('energy adjustments', () => {
  it('scales Garmin expenditure down by the correction factor', () => {
    expect(adjustExpenditure(2800, S)).toBeCloseTo(2380, 6)
  })

  it('scales logged intake up by the correction factor', () => {
    expect(adjustIntake(2000, S)).toBeCloseTo(2200, 6)
  })

  it('produces the worked example deficit of 180 kcal', () => {
    const d = computeDay(day('2026-01-02', 2800, 2000), S)
    expect(d.adjustedExpenditure).toBeCloseTo(2380, 6)
    expect(d.adjustedIntake).toBeCloseTo(2200, 6)
    expect(d.adjustedBalance).toBeCloseTo(180, 6)
    expect(d.isComplete).toBe(true)
  })

  it('treats a day as incomplete when either side is missing', () => {
    expect(computeDay(day('2026-01-02', 2800, null), S).isComplete).toBe(false)
    expect(computeDay(day('2026-01-02', null, 2000), S).isComplete).toBe(false)
    expect(computeDay(day('2026-01-02', 2800, null), S).adjustedBalance).toBeNull()
  })

  it('does not let an incomplete day contribute to the cumulative total', () => {
    const days = computeDays([day('2026-01-01', 2800, 2000), day('2026-01-02', 3000, null)], S)
    expect(cumulativeBalance(days)).toBeCloseTo(180, 6)
  })

  it('subtracts surplus days from cumulative progress', () => {
    const days = computeDays([day('2026-01-01', 2800, 2000), day('2026-01-02', 2000, 2500)], S)
    // Day 2: 2000*0.85 = 1700, 2500*1.10 = 2750, balance = -1050
    expect(cumulativeBalance(days)).toBeCloseTo(180 - 1050, 6)
  })

  it('re-prices history when the adjustment factors change, without touching raw data', () => {
    const raw = [day('2026-01-01', 2800, 2000)]
    const before = cumulativeBalance(computeDays(raw, S))
    const after = cumulativeBalance(computeDays(raw, { ...S, garminAdjustmentFactor: 0.9 }))
    expect(before).toBeCloseTo(180, 6)
    expect(after).toBeCloseTo(2800 * 0.9 - 2200, 6)
    expect(raw[0].rawGarminTotalCalories).toBe(2800) // raw untouched
  })
})

describe('mission target', () => {
  it('derives exactly 84,000 kcal from the 170 to 150 lb goal', () => {
    expect(missionTarget(S)).toBe(84000)
  })

  it('follows a changed target weight', () => {
    // 170 -> 160 lb is 10 lb: 10 * 3500 * 1.2 = 42,000
    expect(missionTarget({ ...S, targetWeightKg: lbToKg(160) })).toBe(42000)
  })

  it('honours an explicit override', () => {
    expect(missionTarget({ ...S, missionTargetOverride: 50000 })).toBe(50000)
  })

  it('reports the worked progress example', () => {
    // Reproduce the spec example: 8,240 kcal of prior progress plus today's 180.
    // The prior day is synthetic (its Garmin figure is back-solved to land on
    // 8,240 exactly); only the arithmetic downstream of it is under test.
    const priorGarmin = (8240 + 2000 * S.intakeAdjustmentFactor) / S.garminAdjustmentFactor
    const days = computeDays(
      [day('2026-01-01', priorGarmin, 2000), day('2026-01-02', 2800, 2000)],
      S,
    )
    const p = missionProgress(days, S)
    expect(p.accumulated).toBeCloseTo(8420, 4)
    expect(p.remaining).toBeCloseTo(75580, 4)
    expect(p.percent).toBeCloseTo(10.02, 2)
    expect(p.theoreticalPoundsLost).toBeCloseTo(8420 / 3500, 6)
  })

  it('counts complete and incomplete days separately', () => {
    const days = computeDays([day('2026-01-01', 2800, 2000), day('2026-01-02', 2800, null)], S)
    const p = missionProgress(days, S)
    expect(p.completeDays).toBe(1)
    expect(p.incompleteDays).toBe(1)
  })

  it('builds a running cumulative series', () => {
    const days = computeDays([day('2026-01-01', 2800, 2000), day('2026-01-02', 2800, 2000)], S)
    const series = cumulativeSeries(days)
    expect(series.map((s) => Math.round(s.cumulative))).toEqual([180, 360])
  })
})

describe('mission projection', () => {
  it('returns null without enough complete days', () => {
    expect(projectMissionCompletion(computeDays([day('2026-01-01', 2800, 2000)], S), S)).toBeNull()
  })

  it('returns null when the recent trend is a surplus', () => {
    const days = computeDays(
      ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].map((d) => day(d, 2000, 2500)),
      S,
    )
    expect(projectMissionCompletion(days, S)).toBeNull()
  })

  it('suppresses a projection that lands beyond the two-year horizon', () => {
    // 16 kcal/day would finish an 84,000 kcal mission in the 2040s.
    const dates = Array.from({ length: 10 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    const days = computeDays(dates.map((d) => day(d, 2800, 2149.090909090909)), S)
    const balance = days[0].adjustedBalance!
    expect(balance).toBeGreaterThan(0)
    expect(balance).toBeLessThan(20)
    expect(projectMissionCompletion(days, S)).toBeNull()
  })

  it('projects a finish date from the recent average', () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    const days = computeDays(dates.map((d) => day(d, 2800, 2000)), S)
    const proj = projectMissionCompletion(days, S)
    expect(proj).not.toBeNull()
    expect(proj!.basis).toBeCloseTo(180, 6)
    // 84,000 accumulated 1,800 so far, 82,200 remaining at 180/day.
    expect(proj!.daysRemaining).toBe(Math.ceil((84000 - 1800) / 180))
  })
})

describe('body composition', () => {
  it('computes the Navy estimate for the starting measurements', () => {
    // waist 87, neck 40, height 170 -> about 17.8%
    const bf = navyBodyFat('male', 170, 87, 40)
    expect(bf).not.toBeNull()
    expect(bf!).toBeCloseTo(17.8, 1)
  })

  it('requires a hip measurement for the female formula', () => {
    expect(navyBodyFat('female', 165, 75, 32)).toBeNull()
    expect(navyBodyFat('female', 165, 75, 32, 95)).not.toBeNull()
  })

  it('rejects impossible girths', () => {
    expect(navyBodyFat('male', 170, 40, 40)).toBeNull()
    expect(navyBodyFat('male', 170, null, 40)).toBeNull()
  })

  it('keeps the Navy and planning estimates separate', () => {
    const comp = bodyComposition('male', 170, lbToKg(170), 87, 40, 20)
    expect(comp.planningBodyFatPercent).toBe(20)
    expect(comp.navyBodyFatPercent!).toBeCloseTo(17.8, 1)
    expect(comp.estimateSpread!).toBeCloseTo(comp.navyBodyFatPercent! - 20, 6)
    expect(comp.fatMassKg! + comp.leanMassKg!).toBeCloseTo(lbToKg(170), 6)
  })
})

describe('trends', () => {
  const pts = [
    { date: '2026-01-01', value: 170 },
    { date: '2026-01-02', value: 169 },
    { date: '2026-01-03', value: 171 },
    { date: '2026-01-04', value: 168 },
  ]

  it('emits no average until the window is full', () => {
    const r = rollingAverage(pts, 3)
    expect(r[0].average).toBeNull()
    expect(r[1].average).toBeNull()
    expect(r[2].average).toBeCloseTo(170, 6)
    expect(r[3].average).toBeCloseTo((169 + 171 + 168) / 3, 6)
  })

  it('fits a downward slope in units per day', () => {
    const fit = linearFit([
      { date: '2026-01-01', value: 170 },
      { date: '2026-01-11', value: 168 },
    ])
    expect(fit!.slope).toBeCloseTo(-0.2, 6)
    expect(fit!.n).toBe(2)
  })

  it('compares means at each end rather than raw endpoints', () => {
    expect(trendChange(pts, 2)).toBeCloseTo((171 + 168) / 2 - (170 + 169) / 2, 6)
  })
})

describe('morning mission', () => {
  const mk = (date: string, morningSteps: number | null) =>
    day(date, 2800, 2000, { stepsBeforeDeadline: morningSteps, stepsTotal: (morningSteps ?? 0) + 3000 })

  it('scores a day against the configured goal', () => {
    expect(computeDay(mk('2026-01-01', 7200), S).morningMissionMet).toBe(true)
    expect(computeDay(mk('2026-01-01', 6999), S).morningMissionMet).toBe(false)
  })

  it('returns null rather than false when there is no reading', () => {
    expect(computeDay(mk('2026-01-01', null), S).morningMissionMet).toBeNull()
  })

  it('skips unknown days instead of breaking the streak', () => {
    const days = computeDays(
      [mk('2026-01-01', 8000), mk('2026-01-02', 8000), mk('2026-01-03', null), mk('2026-01-04', 8000)],
      S,
    )
    expect(morningStats(days, S).currentStreak).toBe(3)
  })

  it('breaks the streak on a real miss and remembers the best run', () => {
    const days = computeDays(
      [mk('2026-01-01', 8000), mk('2026-01-02', 8000), mk('2026-01-03', 100), mk('2026-01-04', 8000)],
      S,
    )
    const stats = morningStats(days, S)
    expect(stats.currentStreak).toBe(1)
    expect(stats.longestStreak).toBe(2)
    expect(stats.successRateAll).toBeCloseTo(75, 6)
    expect(stats.totalSuccesses).toBe(3)
  })

  it('counts down to the deadline and stops after it passes', () => {
    expect(minutesUntilDeadline('09:00', new Date('2026-01-01T08:18:00'))).toBe(42)
    expect(minutesUntilDeadline('09:00', new Date('2026-01-01T09:30:00'))).toBeNull()
  })
})

describe('activities', () => {
  const act = (id: string, type: string, start: string, seconds: number, meters: number | null): Activity => ({
    id,
    externalSource: 'garmin',
    externalId: id,
    activityType: normalizeActivityType(type),
    rawActivityType: type,
    startTime: start,
    durationSeconds: seconds,
    distanceMeters: meters,
    calories: 300,
    averageHr: 150,
    maxHr: 175,
    averageSpeedMps: meters && seconds ? meters / seconds : null,
    cadence: null, runningPower: null, elevationGainMeters: null,
    trainingLoad: null, aerobicTrainingEffect: null, notes: null,
  })

  it('maps Garmin type strings onto the fixed categories', () => {
    expect(normalizeActivityType('treadmill_running')).toBe('running')
    expect(normalizeActivityType('indoor_cycling')).toBe('cycling')
    expect(normalizeActivityType('bouldering')).toBe('climbing')
    expect(normalizeActivityType('strength_training')).toBe('strength')
    expect(normalizeActivityType('kayaking')).toBe('other')
    expect(normalizeActivityType(null)).toBe('other')
  })

  it('summarises totals by type', () => {
    const s = summarize([
      act('1', 'running', '2026-01-01T07:00:00', 1800, 5000),
      act('2', 'running', '2026-01-02T07:00:00', 3600, 10000),
      act('3', 'bouldering', '2026-01-02T18:00:00', 5400, null),
    ])
    expect(s.count).toBe(3)
    expect(s.byType.running.count).toBe(2)
    expect(s.byType.running.meters).toBe(15000)
    expect(s.byType.climbing.seconds).toBe(5400)
    expect(s.totalCalories).toBe(900)
  })

  it('derives running pace from totals, not an average of averages', () => {
    const r = runningStats([
      act('1', 'running', '2026-01-01T07:00:00', 1800, 5000),
      act('2', 'running', '2026-01-02T07:00:00', 3600, 10000),
    ])
    expect(r.runs).toBe(2)
    expect(r.totalMeters).toBe(15000)
    expect(r.averageSpeedMps).toBeCloseTo(15000 / 5400, 6)
    expect(r.longestRunMeters).toBe(10000)
  })

  it('ignores very short efforts when picking a best pace', () => {
    const r = runningStats([
      act('1', 'running', '2026-01-01T07:00:00', 1800, 5000),
      act('2', 'running', '2026-01-02T07:00:00', 20, 400), // 20 m/s sprint artefact
    ])
    expect(r.bestSpeedMps).toBeCloseTo(5000 / 1800, 6)
  })

  it('does not reset the workout streak on a rest day today', () => {
    const now = new Date('2026-01-10T20:00:00')
    const streak = workoutStreak(
      [
        act('1', 'running', '2026-01-09T07:00:00', 1800, 5000),
        act('2', 'running', '2026-01-08T07:00:00', 1800, 5000),
      ],
      now,
    )
    expect(streak).toBe(2)
  })

  it('resolves a week range starting Monday', () => {
    const wed = new Date('2026-01-07T12:00:00') // Wednesday
    const range = resolveRange('week', wed)
    expect(range.from.getDay()).toBe(1)
    expect(range.from.getDate()).toBe(5)
  })
})

describe('reality check', () => {
  const weights = (start: number, perDay: number, n: number): BodyEntry[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (n - 1 - i))
      return {
        date: d.toISOString().slice(0, 10),
        weightKg: lbToKg(start + perDay * i),
        waistCm: null,
        neckCm: null,
        hipCm: null,
        planningBodyFatOverride: null,
        notes: null,
        source: 'manual' as const,
      }
    })

  const recentDays = (n: number, garmin: number, mfp: number) =>
    computeDays(
      Array.from({ length: n }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (n - 1 - i))
        return day(d.toISOString().slice(0, 10), garmin, mfp)
      }),
      S,
    )

  it('refuses to judge without enough data', () => {
    const check = realityCheck(recentDays(3, 2800, 2000), weights(170, -0.05, 3), S)
    expect(check.verdict).toBe('insufficient-data')
    expect(check.message).toContain('Needs')
  })

  it('flags an optimistic model when the scale lags the prediction', () => {
    // 21 days at 500 kcal/day predicts 3 lb, but the scale barely moves.
    const check = realityCheck(recentDays(21, 3000, 2000), weights(170, -0.01, 21), S)
    expect(check.verdict).toBe('overestimating')
    expect(check.differenceLb!).toBeGreaterThan(0)
    expect(check.impliedBalanceScalar!).toBeLessThan(1)
  })

  it('reports alignment when prediction and scale agree', () => {
    // 21 days at 3000*0.85 - 2000*1.1 = 350 kcal/day -> 2.1 lb over the window.
    const days = recentDays(21, 3000, 2000)
    const perDay = 350 / 3500 // lb per day
    const check = realityCheck(days, weights(170, -perDay, 21), S)
    expect(check.verdict).toBe('aligned')
  })

  it('never mutates the settings it was handed', () => {
    const frozen = Object.freeze({ ...S })
    expect(() => realityCheck(recentDays(21, 3000, 2000), weights(170, -0.01, 21), frozen)).not.toThrow()
    expect(frozen.garminAdjustmentFactor).toBe(0.85)
  })
})

describe('units', () => {
  it('round-trips pounds and kilograms', () => {
    expect(kgToLb(lbToKg(170))).toBeCloseTo(170, 9)
  })

  it('formats pace per mile and per kilometre', () => {
    expect(formatPace(1000 / 300, 'metric')).toBe('5:00/km')
    expect(formatPace(null, 'imperial')).toBe('--')
    expect(formatPace(0, 'imperial')).toBe('--')
  })
})
