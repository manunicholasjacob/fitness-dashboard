import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { Card, EmptyState, Stat } from '../components/ui'
import {
  CumulativeChart,
  DailyBalanceChart,
  IntakeVsBurnChart,
  SimpleLineChart,
  StepsChart,
  WeightChart,
} from '../components/charts'
import { cumulativeSeries, missionTarget } from '../core/energy'
import { computeMeasurements, weightPoints } from '../core/body'
import { rollingAverage } from '../core/trend'
import { morningStats } from '../core/morning'
import { filterActivities, resolveRange, runningStats } from '../core/activity'
import { formatInt, kgToLb, metersToMiles } from '../core/units'

const WINDOWS: [number, string][] = [
  [14, '14d'],
  [30, '30d'],
  [90, '90d'],
  [3650, 'All'],
]

export function Analytics() {
  const { days, body, activities, settings } = useData()
  const [window, setWindow] = useState(30)

  const scoped = useMemo(() => days.slice(-window), [days, window])

  const weightSeries = useMemo(() => {
    const pts = weightPoints(body).map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))
    return rollingAverage(pts, Math.min(7, pts.length || 1)).slice(-window)
  }, [body, window])

  const composition = useMemo(
    () =>
      computeMeasurements(body, settings.sex, settings.heightCm, settings.startingBodyFatPercent)
        .slice(-window)
        .map((m) => ({
          date: m.date,
          waist: m.waistCm,
          neck: m.neckCm,
          navy: m.navyBodyFatPercent,
          planning: m.planningBodyFatPercent,
        })),
    [body, settings, window],
  )

  const morning = morningStats(days, settings)

  // Weekly running mileage, bucketed by ISO week start.
  const weeklyMileage = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const a of activities.filter((x) => x.activityType === 'running')) {
      const d = new Date(a.startTime)
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      buckets.set(key, (buckets.get(key) ?? 0) + metersToMiles(a.distanceMeters ?? 0))
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, miles]) => ({ date, miles }))
      .slice(-26)
  }, [activities])

  const monthRun = runningStats(filterActivities(activities, resolveRange('month')))
  const hasEnergy = scoped.some((d) => d.isComplete)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {WINDOWS.map(([n, label]) => (
          <button
            key={label}
            onClick={() => setWindow(n)}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
              window === n
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'border border-[var(--color-edge)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="pt-3 text-base font-semibold tracking-[-0.01em] text-[var(--color-text)]">
        Energy
      </h2>

      <Card title="Cumulative Mission Progress">
        {days.length > 1 ? (
          <CumulativeChart data={cumulativeSeries(days)} target={missionTarget(settings)} height={260} />
        ) : (
          <EmptyState title="Not enough data" body="Two complete days will draw this." />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Daily Adjusted Balance">
          {hasEnergy ? (
            <DailyBalanceChart data={scoped.map((d) => ({ date: d.date, balance: d.adjustedBalance }))} />
          ) : (
            <EmptyState title="No complete days" body="A day needs both Garmin and nutrition data." />
          )}
        </Card>

        <Card title="Raw Expenditure vs Raw Intake" subtitle="Before any adjustment factors">
          {scoped.length > 1 ? (
            <IntakeVsBurnChart
              data={scoped.map((d) => ({
                date: d.date,
                expenditure: d.rawExpenditure,
                intake: d.rawIntake,
              }))}
            />
          ) : (
            <EmptyState title="Not enough data" body="Sync a few days first." />
          )}
        </Card>
      </div>

      <Card title="Adjusted vs Raw" subtitle="What the correction factors actually do">
        {scoped.length > 1 ? (
          <IntakeVsBurnChart
            label="Adjusted"
            data={scoped.map((d) => ({
              date: d.date,
              expenditure: d.adjustedExpenditure,
              intake: d.adjustedIntake,
            }))}
          />
        ) : (
          <EmptyState title="Not enough data" body="Sync a few days first." />
        )}
      </Card>

      <h2 className="pt-3 text-base font-semibold tracking-[-0.01em] text-[var(--color-text)]">
        Weight and Composition
      </h2>

      <Card title="Weight" subtitle="Daily readings with the 7-day average">
        {weightSeries.length > 1 ? (
          <WeightChart data={weightSeries} targetLb={kgToLb(settings.targetWeightKg)} unitLabel="lb" height={260} />
        ) : (
          <EmptyState title="Not enough weigh-ins" body="Log weight on the Check-In tab." />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Waist">
          {composition.some((c) => c.waist !== null) ? (
            <SimpleLineChart data={composition} dataKey="waist" name="Waist" unit=" cm" tone="intake" />
          ) : (
            <EmptyState title="No waist measurements" body="Add one on the Check-In tab." />
          )}
        </Card>

        <Card title="Neck">
          {composition.some((c) => c.neck !== null) ? (
            <SimpleLineChart data={composition} dataKey="neck" name="Neck" unit=" cm" tone="secondary" domainPad={0.5} />
          ) : (
            <EmptyState title="No neck measurements" body="Open the extra fields on Check-In." />
          )}
        </Card>
      </div>

      <Card title="Body Fat Estimates" subtitle="Navy circumference estimate against your planning figure">
        {composition.some((c) => c.navy !== null) ? (
          <SimpleLineChart data={composition} dataKey="navy" name="Navy estimate" unit="%" tone="tertiary" domainPad={1} />
        ) : (
          <EmptyState title="No estimate yet" body="Needs both a waist and a neck measurement." />
        )}
      </Card>

      <h2 className="pt-3 text-base font-semibold tracking-[-0.01em] text-[var(--color-text)]">
        Activity
      </h2>

      <Card
        title="Steps"
        subtitle={`Green is before ${settings.morningDeadline}, the dashed line is the ${formatInt(settings.morningStepGoal)} goal`}
      >
        {scoped.some((d) => d.raw.stepsTotal !== null) ? (
          <StepsChart
            data={scoped.map((d) => ({
              date: d.date,
              morning: d.raw.stepsBeforeDeadline,
              // Stacked, so the second segment is the remainder, not the total.
              total:
                d.raw.stepsTotal !== null && d.raw.stepsBeforeDeadline !== null
                  ? Math.max(0, d.raw.stepsTotal - d.raw.stepsBeforeDeadline)
                  : d.raw.stepsTotal,
            }))}
            goal={settings.morningStepGoal}
          />
        ) : (
          <EmptyState title="No step data" body="Garmin syncs steps each morning." />
        )}
      </Card>

      <Card title="Morning Mission Record">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Current streak" value={formatInt(morning.currentStreak)} size="md" />
          <Stat label="Best streak" value={formatInt(morning.longestStreak)} size="md" />
          <Stat
            label="30-day rate"
            value={morning.successRate30 === null ? '--' : `${morning.successRate30.toFixed(0)}%`}
            size="md"
          />
          <Stat
            label="All-time rate"
            value={morning.successRateAll === null ? '--' : `${morning.successRateAll.toFixed(0)}%`}
            size="md"
            hint={`${morning.totalSuccesses} of ${morning.daysWithData} days`}
          />
        </div>
        <MorningCalendar />
      </Card>

      <Card title="Weekly Running Mileage" subtitle={`${monthRun.totalMiles.toFixed(1)} miles this month`}>
        {weeklyMileage.length > 0 ? (
          <SimpleLineChart data={weeklyMileage} dataKey="miles" name="Weekly mileage" unit=" mi" domainPad={1} />
        ) : (
          <EmptyState title="No runs recorded" body="Runs import from Garmin automatically." />
        )}
      </Card>
    </div>
  )
}

/** GitHub-style grid of morning-mission outcomes over the last 12 weeks. */
function MorningCalendar() {
  const { days } = useData()
  const recent = days.slice(-84)
  if (recent.length === 0) return null

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-1">
        {recent.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${
              d.morningMissionMet === null ? 'no data' : d.morningMissionMet ? 'complete' : 'missed'
            }`}
            className={`h-3.5 w-3.5 rounded-sm ${
              d.morningMissionMet === null
                ? 'bg-[var(--color-edge)]'
                : d.morningMissionMet
                  ? 'bg-[var(--color-accent)]'
                  : 'bg-[var(--color-danger)]/60'
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-accent)]" /> complete
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-danger)]/60" /> missed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-edge)]" /> no data
        </span>
      </div>
    </div>
  )
}
