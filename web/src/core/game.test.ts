import { describe, expect, it } from 'vitest'
import { milestones, rank, rings, streak } from './game'
import { DEFAULT_SETTINGS } from './settings'
import type { ComputedDay, DailyRecord, Settings } from './types'

const S: Settings = { ...DEFAULT_SETTINGS, dailyDeficitGoal: 500, caloriesPerPound: 3500 }

function day(date: string, balance: number | null, protein: number | null = null): ComputedDay {
  return {
    date,
    raw: { protein } as DailyRecord,
    rawExpenditure: balance === null ? null : 2500,
    adjustedExpenditure: balance === null ? null : 2500,
    rawIntake: balance === null ? null : 2500 - balance,
    adjustedIntake: balance === null ? null : 2500 - balance,
    adjustedBalance: balance,
    isComplete: balance !== null,
    morningMissionMet: null,
  }
}

describe('rank', () => {
  it('starts at level 1 before the first pound', () => {
    const r = rank(0, S)
    expect(r.level).toBe(1)
    expect(r.name).toBe('Starting out')
    expect(r.progress).toBe(0)
    expect(r.toNext).toBe(3500)
  })

  it('advances a level per theoretical pound', () => {
    expect(rank(3499, S).level).toBe(1)
    expect(rank(3500, S).level).toBe(2)
    expect(rank(3500, S).name).toBe('First pound')
    expect(rank(7000, S).level).toBe(3)
  })

  it('reports progress through the current level, not overall', () => {
    const r = rank(5250, S) // one and a half pounds
    expect(r.level).toBe(2)
    expect(r.progress).toBeCloseTo(0.5, 6)
    expect(r.toNext).toBe(1750)
  })

  it('follows a changed calories-per-pound rather than hardcoding 3500', () => {
    const r = rank(4000, { ...S, caloriesPerPound: 4000 })
    expect(r.level).toBe(2)
    expect(r.toNext).toBe(4000)
  })

  it('treats a negative cumulative total as the start, not as a negative level', () => {
    const r = rank(-5000, S)
    expect(r.level).toBe(1)
    expect(r.progress).toBe(0)
  })

  it('caps at the top rank instead of running off the end of the names', () => {
    const r = rank(10_000_000, S)
    expect(r.name).toBe('Mission complete')
    expect(r.ceiling).toBeNull()
    expect(r.toNext).toBeNull()
    expect(r.progress).toBe(1)
  })
})

describe('milestones', () => {
  it('places one marker per pound across the mission', () => {
    const m = milestones(0, S) // 84,000 / 3,500 = 24
    expect(m).toHaveLength(24)
    expect(m[0].at).toBe(3500)
    expect(m[23].at).toBe(84000)
  })

  it('marks what has been passed', () => {
    const m = milestones(7200, S)
    expect(m[0].reached).toBe(true)
    expect(m[1].reached).toBe(true)
    expect(m[2].reached).toBe(false)
  })

  it('flags exactly one as next', () => {
    const m = milestones(7200, S)
    expect(m.filter((x) => x.next)).toHaveLength(1)
    expect(m.find((x) => x.next)!.at).toBe(10500)
  })

  it('flags none as next once every marker is passed', () => {
    expect(milestones(90000, S).filter((x) => x.next)).toHaveLength(0)
  })
})

describe('streak', () => {
  const today = '2026-08-28'

  it('counts consecutive goal-meeting days ending at the most recent', () => {
    const s = streak(
      [day('2026-08-24', 600), day('2026-08-25', 700), day('2026-08-26', 800)],
      S,
      today,
    )
    expect(s.current).toBe(3)
    expect(s.best).toBe(3)
  })

  it('breaks the run on a day that missed the goal', () => {
    const s = streak(
      [day('2026-08-24', 600), day('2026-08-25', 100), day('2026-08-26', 800)],
      S,
      today,
    )
    expect(s.current).toBe(1)
    expect(s.best).toBe(1)
  })

  it('breaks the run on an unlogged day rather than skipping over it', () => {
    // The important case: three good days either side of a gap is not a
    // six-day streak, because the gap is the failure this app is about.
    const s = streak(
      [day('2026-08-23', 600), day('2026-08-24', null), day('2026-08-25', 600)],
      S,
      today,
    )
    expect(s.current).toBe(1)
    expect(s.best).toBe(1)
  })

  it('remembers the best run even after it is broken', () => {
    const s = streak(
      [
        day('2026-08-20', 600),
        day('2026-08-21', 600),
        day('2026-08-22', 600),
        day('2026-08-23', 0),
        day('2026-08-24', 600),
      ],
      S,
      today,
    )
    expect(s.best).toBe(3)
    expect(s.current).toBe(1)
  })

  it('excludes today, since a day still running has not failed', () => {
    const s = streak([day('2026-08-27', 600), day(today, 10)], S, today)
    expect(s.current).toBe(1)
  })

  it('counts judgeable days separately from met ones', () => {
    const s = streak([day('2026-08-25', 600), day('2026-08-26', 10), day('2026-08-27', null)], S, today)
    expect(s.totalJudged).toBe(2)
    expect(s.totalMet).toBe(1)
  })

  it('is not confused by days arriving out of order', () => {
    const s = streak([day('2026-08-26', 600), day('2026-08-24', 600), day('2026-08-25', 600)], S, today)
    expect(s.current).toBe(3)
  })
})

describe('rings', () => {
  it('renders deficit and morning always, protein only with a target', () => {
    const noProtein = rings(day('2026-08-28', 250), { ...S, proteinTarget: null }, 3000)
    expect(noProtein.map((r) => r.key)).toEqual(['deficit', 'morning'])

    const withProtein = rings(day('2026-08-28', 250, 90), { ...S, proteinTarget: 150 }, 3000)
    expect(withProtein.map((r) => r.key)).toEqual(['deficit', 'morning', 'protein'])
  })

  it('reports progress against each target', () => {
    const [deficit, morning] = rings(day('2026-08-28', 250), S, 3500)
    expect(deficit.progress).toBeCloseTo(0.5, 6)
    expect(morning.progress).toBeCloseTo(0.5, 6)
  })

  it('clamps a beaten target at full rather than overflowing the ring', () => {
    const [deficit] = rings(day('2026-08-28', 5000), S, 0)
    expect(deficit.progress).toBe(1)
    expect(deficit.closed).toBe(true)
  })

  it('marks an unknown reading as unstarted rather than as zero progress', () => {
    const [deficit, morning] = rings(day('2026-08-28', null), S, null)
    expect(deficit.known).toBe(false)
    expect(deficit.readout).toContain('--')
    expect(morning.known).toBe(false)
    expect(deficit.closed).toBe(false)
  })

  it('does not close a ring on missing data', () => {
    const withProtein = rings(day('2026-08-28', null, null), { ...S, proteinTarget: 150 }, null)
    expect(withProtein.every((r) => !r.closed)).toBe(true)
  })
})
