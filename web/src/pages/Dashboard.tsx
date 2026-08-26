import { Suspense, lazy } from 'react'
import { useData } from '../lib/data'
import {
  MissionCard,
  MorningMissionCard,
  NutritionCard,
  PeriodDeficitCard,
  TodayActivityCard,
  TodayEnergyCard,
  WeekWorkoutsCard,
  WeightCard,
} from '../components/cards'
import { Card } from '../components/ui'
import { cumulativeSeries, missionTarget } from '../core/energy'
import { weightPoints } from '../core/body'
import { rollingAverage } from '../core/trend'
import { kgToLb } from '../core/units'
import { buildInsights } from '../core/insights'

// Charts are the single biggest dependency in the app. Deferring them keeps
// the mission number, today's deficit and the morning steps on screen first.
const CumulativeChart = lazy(() =>
  import('../components/charts').then((m) => ({ default: m.CumulativeChart })),
)
const WeightChart = lazy(() => import('../components/charts').then((m) => ({ default: m.WeightChart })))
const ChartSkeleton = () => (
  <div className="h-[240px] animate-pulse rounded-[var(--radius-control)] bg-[var(--color-edge)]/40" aria-hidden="true" />
)

export function Dashboard() {
  const { days, body, activities, settings, loading, servedFromCacheMs } = useData()

  const cumulative = cumulativeSeries(days)
  const target = missionTarget(settings)

  const wPoints = weightPoints(body).map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))
  const weightSeries = rollingAverage(wPoints, Math.min(7, wPoints.length || 1))

  const insights = buildInsights(days, body, activities, settings)

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <MissionCard />

      {/* The three numbers that answer "how am I doing" without scrolling. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <TodayEnergyCard />
        <MorningMissionCard />
        <WeightCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NutritionCard />
        <TodayActivityCard />
      </div>

      <PeriodDeficitCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cumulative Deficit Trend">
          {cumulative.length > 1 ? (
            <Suspense fallback={<ChartSkeleton />}>
              <CumulativeChart data={cumulative} target={target} />
            </Suspense>
          ) : (
            <p className="py-12 text-center text-xs text-[var(--color-muted)]">
              Two days of complete data will draw this chart.
            </p>
          )}
        </Card>

        <Card title="Weight Trend" subtitle="Daily readings behind the 7-day average">
          {weightSeries.length > 1 ? (
            <Suspense fallback={<ChartSkeleton />}>
              <WeightChart data={weightSeries} targetLb={kgToLb(settings.targetWeightKg)} unitLabel="lb" />
            </Suspense>
          ) : (
            <p className="py-12 text-center text-xs text-[var(--color-muted)]">
              Log a few weigh-ins to see the trend.
            </p>
          )}
        </Card>
      </div>

      <WeekWorkoutsCard />

      {insights.length > 0 && (
        <Card title="Insights" subtitle="Computed from your data, nothing invented">
          <ul className="space-y-2">
            {insights.map((i) => (
              <li key={i.id} className="flex gap-2.5 text-sm">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    i.tone === 'positive'
                      ? 'bg-[var(--color-accent)]'
                      : i.tone === 'caution'
                        ? 'bg-[var(--color-warn)]'
                        : 'bg-[var(--color-muted)]'
                  }`}
                />
                <span className="text-[var(--color-soft)]">{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {servedFromCacheMs !== null && (
        <p className="pb-2 text-center text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
          Showing cached data from {Math.round(servedFromCacheMs / 60000)} minutes ago
        </p>
      )}
    </div>
  )
}

/**
 * First-paint placeholder.
 *
 * Shaped like the real dashboard rather than a spinner, so the layout does not
 * jump when data lands. In practice this is rarely seen: the cached snapshot
 * paints immediately on any device that has opened the app before.
 */
function DashboardSkeleton() {
  const block = 'animate-pulse rounded-[var(--radius-card)] border border-[var(--color-edge)] bg-[var(--color-card)]'
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your mission">
      <div className={`${block} h-56`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${block} h-64`} />
        <div className={`${block} h-64`} />
        <div className={`${block} h-64`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${block} h-72`} />
        <div className={`${block} h-72`} />
      </div>
      <span className="sr-only">Loading your mission</span>
    </div>
  )
}
