import { describe, expect, it } from 'vitest'
import { burnRate, dayGap, shareOfMission, stepsToClose, suggestions } from './suggest'
import { DEFAULT_SETTINGS } from './settings'
import type { Activity, ActivityType, ComputedDay, Settings } from './types'

const S: Settings = { ...DEFAULT_SETTINGS, dailyDeficitGoal: 500, intakeAdjustmentFactor: 1.1 }

function act(type: ActivityType, minutes: number, calories: number | null): Activity {
  return {
    id: `${type}-${minutes}-${calories}`,
    externalSource: 'garmin',
    externalId: null,
    activityType: type,
    rawActivityType: null,
    startTime: '2026-08-20T07:00:00Z',
    durationSeconds: minutes * 60,
    distanceMeters: null,
    calories,
    averageHr: null,
    maxHr: null,
    averageSpeedMps: null,
    cadence: null,
    runningPower: null,
    elevationGainMeters: null,
    trainingLoad: null,
  } as Activity
}

function day(expenditure: number | null, intake: number | null): ComputedDay {
  return {
    date: '2026-08-28',
    raw: {} as ComputedDay['raw'],
    rawExpenditure: expenditure,
    adjustedExpenditure: expenditure,
    rawIntake: intake,
    adjustedIntake: intake,
    adjustedBalance: expenditure === null || intake === null ? null : expenditure - intake,
    isComplete: expenditure !== null && intake !== null,
    morningMissionMet: null,
  }
}

describe('day gap', () => {
  it('reports the shortfall against the daily goal', () => {
    const g = dayGap(day(2400, 2100), S)
    expect(g.current).toBe(300)
    expect(g.remaining).toBe(200)
    expect(g.met).toBe(false)
    expect(g.progress).toBeCloseTo(0.6, 6)
  })

  it('never reports a negative shortfall once the goal is beaten', () => {
    const g = dayGap(day(2900, 2100), S)
    expect(g.current).toBe(800)
    expect(g.remaining).toBe(0)
    expect(g.met).toBe(true)
    expect(g.progress).toBe(1)
  })

  it('leaves the deficit unknown when intake has not been logged', () => {
    const g = dayGap(day(2400, null), S)
    expect(g.current).toBeNull()
    expect(g.remaining).toBeNull()
    expect(g.progress).toBeNull()
    expect(g.met).toBe(false)
  })

  it('still gives an intake budget when only expenditure is known', () => {
    // 2,400 burned, 500 goal: 1,900 of adjusted intake is affordable, which is
    // 1,900 / 1.1 as the food label reads it.
    const g = dayGap(day(2400, null), S)
    expect(g.burnedSoFar).toBe(2400)
    expect(g.intakeBudget).toBeCloseTo(1900 / 1.1, 6)
  })

  it('does not offer a negative intake budget on a very low burn', () => {
    expect(dayGap(day(300, null), S).intakeBudget).toBe(0)
  })

  it('reports nothing at all when there is no day', () => {
    const g = dayGap(undefined, S)
    expect(g.goal).toBe(500)
    expect(g.current).toBeNull()
    expect(g.burnedSoFar).toBeNull()
  })
})

describe('burn rate', () => {
  it('weights by duration rather than averaging session rates', () => {
    // 10 min at 20/min and 90 min at 10/min is 1,100 kcal over 100 min = 11.0,
    // not the 15.0 that averaging the two rates would give.
    const r = burnRate([act('running', 10, 200), act('running', 90, 900)], 'running')
    expect(r.basis).toBe('personal')
    expect(r.sessions).toBe(2)
    expect(r.perMinute).toBeCloseTo(11, 6)
  })

  it('falls back to a reference rate when nothing is logged', () => {
    const r = burnRate([], 'swimming')
    expect(r.basis).toBe('reference')
    expect(r.sessions).toBe(0)
    expect(r.perMinute).toBeGreaterThan(0)
  })

  it('ignores sessions with no calorie figure', () => {
    expect(burnRate([act('running', 30, null)], 'running').basis).toBe('reference')
  })

  it('ignores very short sessions, which are warm-ups or mis-logs', () => {
    expect(burnRate([act('running', 2, 60)], 'running').basis).toBe('reference')
  })

  it('does not let one activity type inform another', () => {
    const acts = [act('running', 60, 660)]
    expect(burnRate(acts, 'running').basis).toBe('personal')
    expect(burnRate(acts, 'strength').basis).toBe('reference')
  })
})

describe('suggestions', () => {
  const history = [act('running', 60, 660), act('strength', 60, 480)]

  it('converts a gap into durations, shortest first', () => {
    const out = suggestions(330, history)
    expect(out.map((s) => s.type)).toEqual(['running', 'strength'])
    // 330 / 11 = 30 exactly; 330 / 8 = 41.25, rounded up to the next 5.
    expect(out[0].minutes).toBe(30)
    expect(out[1].minutes).toBe(45)
  })

  it('only offers activity types that have actually been done', () => {
    const out = suggestions(300, history)
    expect(out.every((s) => s.type === 'running' || s.type === 'strength')).toBe(true)
  })

  it('offers a sensible starting set when nothing has been logged', () => {
    const out = suggestions(300, [])
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((s) => s.rate.basis === 'reference')).toBe(true)
  })

  it('returns nothing when there is no gap to close', () => {
    expect(suggestions(0, history)).toEqual([])
    expect(suggestions(-100, history)).toEqual([])
  })

  it('drops options that would take implausibly long', () => {
    // 5,000 kcal at 11/min is over seven hours of running.
    expect(suggestions(5000, history, { maxMinutes: 120 })).toEqual([])
  })

  it('rounds up to whole five-minute blocks, never down', () => {
    for (const s of suggestions(331, history)) {
      expect(s.minutes % 5).toBe(0)
      expect(s.minutes * s.rate.perMinute).toBeGreaterThanOrEqual(331)
    }
  })
})

describe('steps and mission share', () => {
  it('rounds steps to something countable', () => {
    const steps = stepsToClose(200)
    expect(steps).not.toBeNull()
    expect(steps! % 500).toBe(0)
    expect(steps! * 0.045).toBeGreaterThanOrEqual(200)
  })

  it('gives up rather than suggesting a march', () => {
    expect(stepsToClose(5000)).toBeNull()
  })

  it('expresses a session as a share of the mission', () => {
    expect(shareOfMission(840, 84000)).toBeCloseTo(1, 6)
    expect(shareOfMission(100, 0)).toBe(0)
  })
})
