import { Suspense, lazy } from 'react'
import { useData } from '../lib/data'
import {
  CloseTheGapCard,
  MissionCard,
  MorningMissionCard,
  NutritionCard,
  PeriodDeficitCard,
  RecentDaysCard,
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
    <div className="space-y-5">
      <MissionCard />

      {/*
       * The numbers that answer "how am I doing" without scrolling.
       *
       * Deliberately not three equal columns. Today's energy is the day's
       * headline and carries the full raw-to-adjusted chain for both providers,
       * so it takes the wider half; the morning mission and weight are single
       * figures and stack beside it. Equal thirds would give three unequal
       * things the same emphasis and leave the eye with nowhere to land.
       */}
      <div className="grid min-w-0 items-stretch gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <TodayEnergyCard />
        </div>
        <div className="grid min-w-0 gap-5 lg:col-span-5">
          <MorningMissionCard />
          <WeightCard />
        </div>
      </div>

      {/* The actionable card sits high. The persona review found the one lever
          available on an incomplete day was ranked ninth on the page. */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <CloseTheGapCard />
        <NutritionCard />
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <TodayActivityCard />
        <WeekWorkoutsCard />
      </div>

      <PeriodDeficitCard />

      <RecentDaysCard />

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
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

      {insights.length > 0 && (
        <Card title="Insights" subtitle="Computed from your data, nothing invented">
          <ul className="space-y-2.5">
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
  const block =
    'animate-pulse rounded-[var(--radius-card)] border border-[var(--color-edge)] ' +
    'bg-[var(--color-card)] shadow-[var(--shadow-raised)]'
  // Shaped like the real layout, asymmetry included, so nothing shifts on load.
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your mission">
      <div className={`${block} h-64 rounded-[var(--radius-hero)]`} />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className={`${block} h-72 lg:col-span-7`} />
        <div className="grid min-w-0 gap-5 lg:col-span-5">
          <div className={`${block} h-[8.5rem]`} />
          <div className={`${block} h-[8.5rem]`} />
        </div>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className={`${block} h-72`} />
        <div className={`${block} h-72`} />
      </div>
      <span className="sr-only">Loading your mission</span>
    </div>
  )
}
