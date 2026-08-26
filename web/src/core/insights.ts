/**
 * Insights.
 *
 * Every line here is a direct restatement of a computed number. There is no
 * language model in this path and no motivational commentary. If an insight
 * cannot be traced to arithmetic on your own data, it does not belong here.
 */

import type { Activity, BodyEntry, ComputedDay, Settings } from './types'
import { missionProgress } from './energy'
import { morningStats } from './morning'
import { filterActivities, resolveRange, runningStats, summarize } from './activity'
import { rollingAverage, trendChange, type Point } from './trend'
import { kgToLb } from './units'
import { weightPoints } from './body'
import { realityCheck } from './realitycheck'

export type InsightTone = 'positive' | 'neutral' | 'caution'

export interface Insight {
  id: string
  text: string
  tone: InsightTone
}

const pct = (n: number) => `${n.toFixed(0)}%`
const int = (n: number) => Math.round(n).toLocaleString('en-US')

export function buildInsights(
  days: ComputedDay[],
  entries: BodyEntry[],
  activities: Activity[],
  settings: Settings,
): Insight[] {
  const out: Insight[] = []
  const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date))

  // --- Mission ---
  const progress = missionProgress(sorted, settings)
  if (progress.accumulated !== 0) {
    out.push({
      id: 'mission-progress',
      text: `You are ${pct(progress.percent)} of the way through your ${int(progress.target)} kcal mission.`,
      tone: progress.percent > 0 ? 'positive' : 'caution',
    })
  }

  // --- Weekly average deficit ---
  const week = sorted.slice(-7).filter((d) => d.isComplete)
  if (week.length >= 3) {
    const avg = week.reduce((s, d) => s + (d.adjustedBalance ?? 0), 0) / week.length
    out.push({
      id: 'weekly-average',
      text:
        avg >= 0
          ? `Your average daily adjusted deficit over the last ${week.length} complete days is ${int(avg)} kcal.`
          : `You have averaged a ${int(Math.abs(avg))} kcal daily surplus over the last ${week.length} complete days.`,
      tone: avg >= 0 ? 'positive' : 'caution',
    })
  }

  // --- Data completeness. Silence about missing days is how a dashboard lies. ---
  const recent = sorted.slice(-7)
  const incomplete = recent.filter((d) => !d.isComplete).length
  if (incomplete > 0) {
    out.push({
      id: 'incomplete-days',
      text:
        `${incomplete} of the last ${recent.length} days are missing either Garmin or nutrition data ` +
        `and contribute nothing to the mission total.`,
      tone: 'caution',
    })
  }

  // --- Weight trend ---
  const wPoints: Point[] = weightPoints(entries).map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))

  if (wPoints.length >= 4) {
    const change = trendChange(wPoints.slice(-14), 7)
    if (change !== null) {
      const dir = change < 0 ? 'down' : 'up'
      out.push({
        id: 'weight-trend',
        text: `Your 7-day weight trend is ${dir} ${Math.abs(change).toFixed(1)} lb.`,
        tone: change < 0 ? 'positive' : 'neutral',
      })
    }

    const smoothed = rollingAverage(wPoints, Math.min(7, wPoints.length))
    const latest = smoothed[smoothed.length - 1]
    const current = latest.average ?? latest.value
    const remaining = current - kgToLb(settings.targetWeightKg)
    if (remaining > 0) {
      out.push({
        id: 'weight-remaining',
        text: `${remaining.toFixed(1)} lb remaining to your ${kgToLb(settings.targetWeightKg).toFixed(0)} lb target, on the smoothed trend.`,
        tone: 'neutral',
      })
    }
  }

  // --- Morning mission ---
  const morning = morningStats(sorted, settings)
  const weekMorning = sorted.slice(-7).filter((d) => d.morningMissionMet !== null)
  if (weekMorning.length > 0) {
    const hits = weekMorning.filter((d) => d.morningMissionMet).length
    out.push({
      id: 'morning-week',
      text: `You completed your Morning Mission ${hits} of ${weekMorning.length} days this week.`,
      tone: hits >= weekMorning.length - 1 ? 'positive' : 'neutral',
    })
  }
  if (morning.currentStreak >= 3) {
    out.push({
      id: 'morning-streak',
      text: `Morning Mission streak: ${morning.currentStreak} days (best ${morning.longestStreak}).`,
      tone: 'positive',
    })
  }

  // --- Activity ---
  const monthActivities = filterActivities(activities, resolveRange('month'))
  const run = runningStats(monthActivities)
  if (run.runs > 0) {
    out.push({
      id: 'running-month',
      text: `You have run ${run.totalMiles.toFixed(1)} miles across ${run.runs} runs this month.`,
      tone: 'positive',
    })
  }
  const weekActivities = summarize(filterActivities(activities, resolveRange('week')))
  if (weekActivities.count > 0) {
    out.push({
      id: 'workouts-week',
      text: `${weekActivities.count} workouts this week totalling ${Math.round(weekActivities.totalSeconds / 60)} minutes.`,
      tone: 'positive',
    })
  }

  // --- Model check ---
  const check = realityCheck(sorted, entries, settings)
  if (check.verdict === 'overestimating' || check.verdict === 'underestimating') {
    out.push({
      id: 'reality-check',
      text:
        `Model check: predicted ${check.predictedLossLb!.toFixed(1)} lb from your cumulative deficit, ` +
        `scale trend shows ${check.observedLossLb!.toFixed(1)} lb. Review your adjustment assumptions.`,
      tone: 'caution',
    })
  }

  return out
}
