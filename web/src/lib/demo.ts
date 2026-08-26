/**
 * Demo data generator.
 *
 * Used to exercise every chart before Garmin and MyFitnessPal are connected.
 * Everything it produces is flagged (`is_demo`, `source: 'demo'`) so the UI can
 * shout about it and Settings can delete precisely this and nothing else.
 */

import type { BodyEntry } from '../core/types'
import { lbToKg } from '../core/units'
import type { BulkDailyRow } from './api'

/** Deterministic pseudo-random, so the demo looks the same on every device. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const isoDaysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface DemoData {
  daily: BulkDailyRow[]
  body: (Partial<BodyEntry> & { date: string })[]
  activities: {
    activityType: string
    startTime: string
    durationSeconds: number
    distanceMeters: number | null
    calories: number | null
  }[]
}

export function generateDemoData(days = 45): DemoData {
  const rand = mulberry32(20260825)
  const daily: DemoData['daily'] = []
  const body: DemoData['body'] = []
  const activities: DemoData['activities'] = []

  let weightLb = 170

  for (let i = days - 1; i >= 0; i--) {
    const date = isoDaysAgo(i)
    const dow = new Date(`${date}T12:00:00`).getDay()
    const isWeekend = dow === 0 || dow === 6

    // Energy: weekends eat more and move less, which is what makes the
    // adaptive reality check interesting rather than a flat line.
    const garminTotal = Math.round(2800 + rand() * 550 + (isWeekend ? -150 : 0))
    const mfpCalories = Math.round(1600 + rand() * 360 + (isWeekend ? 400 : 0))

    const morningSteps = Math.round(isWeekend ? 2500 + rand() * 5500 : 5800 + rand() * 3200)
    const totalSteps = morningSteps + Math.round(3500 + rand() * 4500)

    daily.push({
      date,
      raw_garmin_total_calories: garminTotal,
      raw_garmin_active_calories: Math.round(garminTotal * 0.32),
      raw_garmin_resting_calories: Math.round(garminTotal * 0.68),
      raw_mfp_calories: mfpCalories,
      protein: Math.round(120 + rand() * 60),
      carbs: Math.round(180 + rand() * 90),
      fat: Math.round(60 + rand() * 35),
      fiber: Math.round(18 + rand() * 16),
      sugar: Math.round(45 + rand() * 40),
      steps_total: totalSteps,
      steps_before_deadline: morningSteps,
      distance_meters: Math.round(totalSteps * 0.75),
      active_minutes: Math.round(35 + rand() * 60),
      intensity_minutes: Math.round(20 + rand() * 45),
      average_hr: Math.round(66 + rand() * 12),
      resting_hr: Math.round(50 + rand() * 7),
      sleep_seconds: Math.round((6.1 + rand() * 1.9) * 3600),
      sleep_score: Math.round(62 + rand() * 30),
      stress_avg: Math.round(24 + rand() * 22),
      body_battery_high: Math.round(72 + rand() * 25),
      body_battery_low: Math.round(10 + rand() * 22),
      energy_source: 'demo',
      nutrition_source: 'demo',
      is_demo: true,
    })

    // Weight drifts down with real daily noise on top of the trend.
    const trueDeficit = garminTotal * 0.85 - mfpCalories * 1.1
    weightLb -= trueDeficit / 3500
    const noise = (rand() - 0.5) * 1.6

    body.push({
      date,
      weightKg: lbToKg(weightLb + noise),
      // Waist most days, neck occasionally, matching how you will actually use it.
      waistCm: rand() > 0.25 ? 87 - (170 - weightLb) * 0.35 + (rand() - 0.5) * 0.6 : null,
      neckCm: i % 7 === 0 ? 40 - (170 - weightLb) * 0.06 : null,
      source: 'demo',
    })

    // Roughly four sessions a week.
    if (rand() > 0.45) {
      const kind = rand()
      if (kind < 0.45) {
        const meters = Math.round(4000 + rand() * 7000)
        activities.push({
          activityType: 'running',
          startTime: `${date}T07:${String(Math.floor(rand() * 50)).padStart(2, '0')}:00`,
          durationSeconds: Math.round(meters / (2.7 + rand() * 0.7)),
          distanceMeters: meters,
          calories: Math.round(meters * 0.062),
        })
      } else if (kind < 0.75) {
        activities.push({
          activityType: 'strength',
          startTime: `${date}T18:${String(Math.floor(rand() * 50)).padStart(2, '0')}:00`,
          durationSeconds: Math.round((40 + rand() * 30) * 60),
          distanceMeters: null,
          calories: Math.round(220 + rand() * 160),
        })
      } else {
        activities.push({
          activityType: 'climbing',
          startTime: `${date}T19:${String(Math.floor(rand() * 40)).padStart(2, '0')}:00`,
          durationSeconds: Math.round((70 + rand() * 50) * 60),
          distanceMeters: null,
          calories: Math.round(400 + rand() * 250),
        })
      }
    }
  }

  return { daily, body, activities }
}
