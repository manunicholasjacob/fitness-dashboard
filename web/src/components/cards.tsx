import { useData } from '../lib/data'
import { AdjustmentChain, Card, EmptyState, ProgressBar, Stat, Tag } from './ui'
import { QuickCalories } from './QuickCalories'
import {
  cumulativeBalance,
  missionProgress,
  projectMissionCompletion,
} from '../core/energy'
import { minutesUntilDeadline, morningStats } from '../core/morning'
import { latestMeasurement, weightPoints } from '../core/body'
import { rollingAverage, trendChange } from '../core/trend'
import { filterActivities, resolveRange, summarize } from '../core/activity'
import {
  formatDistance,
  formatDuration,
  formatInt,
  formatSigned,
  formatWeight,
  kgToLb,
} from '../core/units'
import type { ComputedDay } from '../core/types'

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return todayIso(d)
}

export function useToday(): ComputedDay | undefined {
  const { days } = useData()
  const iso = todayIso()
  return days.find((d) => d.date === iso)
}

// --- Mission ----------------------------------------------------------------

export function MissionCard({ compact = false }: { compact?: boolean }) {
  const { days, settings, error } = useData()
  const p = missionProgress(days, settings)
  const projection = projectMissionCompletion(days, settings)

  // Unknown is not zero. If the load failed and nothing arrived, every other
  // card in this app renders "--" rather than inventing a figure; the one that
  // carries the whole point of the product has to do the same.
  const unknown = error !== null && days.length === 0

  return (
    <Card
      accent
      tone="hero"
      className="relative isolate overflow-hidden bg-gradient-to-b
        from-[var(--color-card-raised)] to-[var(--color-card)]"
    >
      {/* An ambient wash centred behind the headline figure, so the one number
          the app exists for sits in light rather than on flat card colour. It is
          radial and off-centre-weighted rather than a linear fade, which is the
          gradient that reads as a template. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-72
          bg-[radial-gradient(60%_100%_at_50%_0%,var(--hero-glow),var(--hero-glow-mid)_52%,transparent_78%)]"
      />

      <div className="text-center">
        <h2 className="eyebrow tracking-[0.2em] text-[var(--color-muted)]">
          Energy Deficit Mission
        </h2>

        {/* One spoken sentence for the whole card, so a screen reader gets the
            state rather than three orphaned numbers. */}
        <p className="sr-only" aria-live="polite">
          {unknown
            ? 'Mission progress is unavailable because the data could not be loaded.'
            : `${p.percent.toFixed(1)} percent complete. ${formatInt(p.accumulated)} of ${formatInt(
                p.target,
              )} kilocalories accumulated, ${formatInt(p.remaining)} remaining.`}
        </p>

        {/* The percent sign is set smaller and lighter than the figure. At the
            same weight it reads as a fourth digit and steals from the number. */}
        <p
          aria-hidden="true"
          className={`display mt-5 text-6xl sm:text-8xl ${
            unknown ? 'text-[var(--color-muted)]' : 'text-[var(--color-accent)]'
          }`}
        >
          {unknown ? '--' : p.percent.toFixed(1)}
          {!unknown && (
            <span className="ml-0.5 align-baseline text-[0.42em] font-semibold tracking-normal opacity-70">
              %
            </span>
          )}
        </p>

        <p className="tnum mt-3 text-base tracking-[-0.01em] text-[var(--color-text)] sm:text-lg">
          {unknown ? (
            <span className="text-[var(--color-muted)]">Progress unavailable</span>
          ) : (
            <>
              <span className="font-semibold">{formatInt(p.accumulated)}</span>{' '}
              <span className="text-[var(--color-muted)]">of {formatInt(p.target)} kcal</span>
            </>
          )}
        </p>

        {/*
         * The bar sits in a shallow tray rather than directly on the card.
         *
         * Two enclosures with concentric radii, an outer hairline and an inner
         * channel: the same trick a physical instrument uses to make a gauge
         * look set into the panel rather than printed on it. It also gives the
         * one element that is nearly empty at 0.2% something to be empty
         * inside.
         */}
        <div className="mx-auto mt-5 max-w-lg">
          <ProgressBar percent={p.percent} height="h-3" />
          {/* The two ends of the bar, labelled. A bar with no scale asks the
              reader to guess what full means. */}
          <div className="mt-2 flex items-baseline justify-between text-[11px]
            text-[var(--color-muted)]">
            <span className="tnum">{formatInt(p.remaining)} kcal to go</span>
            <span className="tnum">{formatInt(p.target)}</span>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 border-t border-[var(--color-edge)] pt-5 sm:grid-cols-4">
          <Stat
            label="Theoretical lb"
            value={p.theoreticalPoundsLost.toFixed(2)}
            size="sm"
            hint="Deficit / 3,500. Not a scale reading."
          />
          <Stat
            label="Complete days"
            value={formatInt(p.completeDays)}
            size="sm"
            hint={p.incompleteDays > 0 ? `${p.incompleteDays} incomplete` : 'All days counted'}
            tone={p.incompleteDays > 0 ? 'muted' : 'default'}
          />
          <Stat
            label="Avg / day"
            value={p.averagePerCompleteDay === null ? '--' : formatSigned(p.averagePerCompleteDay)}
            size="sm"
            hint="Across complete days"
          />
          <Stat
            label="Est. finish"
            value={
              projection
                ? projection.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                : '--'
            }
            size="sm"
            hint={
              projection
                ? `Estimate at ${formatInt(projection.basis)} kcal/day`
                : p.completeDays < 3
                  ? 'Needs a few complete days'
                  : 'Current trend is too slow or negative to project'
            }
            tone="muted"
          />
        </div>
      )}
    </Card>
  )
}

// --- Today's energy ---------------------------------------------------------

export function TodayEnergyCard() {
  const { settings } = useData()
  const today = useToday()

  return (
    <Card
      title="Today's Energy"
      right={<Tag kind={today?.isComplete ? 'derived' : 'raw'} />}
      className="flex h-full flex-col"
    >
      {!today ? (
        <EmptyState
          title="No data for today yet"
          body="Garmin syncs automatically. Calories are the one number you enter yourself."
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="grid gap-3 sm:grid-cols-2">
            <AdjustmentChain
              label="Garmin expenditure"
              raw={today.rawExpenditure}
              factor={settings.garminAdjustmentFactor}
              adjusted={today.adjustedExpenditure}
            />
            <AdjustmentChain
              label="MyFitnessPal intake"
              raw={today.rawIntake}
              factor={settings.intakeAdjustmentFactor}
              adjusted={today.adjustedIntake}
            />
          </div>

          {/* This panel absorbs whatever height the row has spare. Letting the
              card's own conclusion grow is better than leaving a gap under it,
              which reads as a missing element rather than as breathing room. */}
          <div className="mt-4 flex flex-1 flex-col justify-center rounded-[var(--radius-control)]
            bg-[var(--color-inset)] px-5 py-7 text-center ring-1 ring-inset ring-[var(--color-edge)]">
            <p className="eyebrow text-[var(--color-muted)]">
              Today's adjusted {(today.adjustedBalance ?? 0) >= 0 ? 'deficit' : 'surplus'}
            </p>
            <p
              className={`display mt-2 text-5xl ${
                today.adjustedBalance === null
                  ? 'text-[var(--color-muted)]'
                  : today.adjustedBalance >= 0
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-danger)]'
              }`}
            >
              {today.adjustedBalance === null ? '--' : formatSigned(today.adjustedBalance)}
            </p>

            {/* The subtraction the figure above comes from. The two chains show
                how each side was adjusted; without this the card stops one step
                short of saying where the answer came from. */}
            {today.adjustedBalance !== null && (
              <p className="tnum mt-3 text-sm text-[var(--color-muted)]">
                <span className="font-semibold text-[var(--color-soft)]">
                  {formatInt(today.adjustedExpenditure)}
                </span>{' '}
                burned{' '}
                <span aria-hidden="true" className="mx-0.5 text-[var(--color-muted)]">
                  &minus;
                </span>
                <span className="sr-only">minus</span>{' '}
                <span className="font-semibold text-[var(--color-soft)]">
                  {formatInt(today.adjustedIntake)}
                </span>{' '}
                eaten
              </p>
            )}
            {!today.isComplete && (
              <p className="mt-2 text-xs text-[var(--color-warn-text)]">
                {today.rawIntake === null
                  ? 'No calories logged yet, so today counts as zero toward the mission.'
                  : 'Garmin has not synced today, so today counts as zero toward the mission.'}
              </p>
            )}
          </div>

          {today.rawIntake === null && <QuickCalories />}
        </div>
      )}
    </Card>
  )
}

// --- Morning mission --------------------------------------------------------

export function MorningMissionCard() {
  const { days, settings } = useData()
  const stats = morningStats(days, settings)
  const today = useToday()

  const current = today?.raw.stepsBeforeDeadline ?? today?.raw.stepsTotal ?? null
  const percent = current === null ? 0 : (current / stats.goal) * 100
  const remaining = current === null ? stats.goal : Math.max(0, stats.goal - current)
  const minutesLeft = minutesUntilDeadline(settings.morningDeadline)

  return (
    <Card
      title="Morning Mission"
      subtitle={`${formatInt(stats.goal)} steps before ${settings.morningDeadline}`}
      right={
        stats.currentStreak > 0 ? (
          <span className="tnum rounded-full border border-[var(--color-accent-dim)] px-2 py-1 text-[11px] font-semibold text-[var(--color-accent-text)]">
            {stats.currentStreak} day streak
          </span>
        ) : null
      }
    >
      <div className="tnum text-3xl font-bold">
        {current === null ? '--' : formatInt(current)}
        <span className="text-lg text-[var(--color-muted)]"> / {formatInt(stats.goal)}</span>
      </div>

      <div className="mt-3">
        <ProgressBar percent={percent} tone={percent >= 100 ? 'accent' : 'warn'} />
      </div>

      <p className="mt-2 text-xs text-[var(--color-muted)]">
        {percent >= 100
          ? 'Mission complete for today.'
          : minutesLeft !== null
            ? `${formatInt(remaining)} steps remaining, ${minutesLeft} minutes left.`
            : current === null
              ? 'Waiting on this morning’s Garmin sync.'
              : `Deadline passed, ${formatInt(remaining)} steps short.`}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-edge)] pt-3">
        <Stat label="Best streak" value={formatInt(stats.longestStreak)} size="sm" />
        <Stat
          label="7-day rate"
          value={stats.successRate7 === null ? '--' : `${stats.successRate7.toFixed(0)}%`}
          size="sm"
        />
        <Stat
          label="Avg morning"
          value={stats.averageMorningSteps === null ? '--' : formatInt(stats.averageMorningSteps)}
          size="sm"
        />
      </div>
    </Card>
  )
}

// --- Weight -----------------------------------------------------------------

export function WeightCard() {
  const { body, settings } = useData()
  const points = weightPoints(body).map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))

  const smoothed = rollingAverage(points, Math.min(7, points.length || 1))
  const last = smoothed[smoothed.length - 1]
  const trendLb = last ? (last.average ?? last.value) : null
  const change7 = trendChange(points.slice(-14), 7)

  const startLb = kgToLb(settings.startingWeightKg)
  const targetLb = kgToLb(settings.targetWeightKg)
  const lost = trendLb === null ? null : startLb - trendLb
  const toGo = trendLb === null ? null : trendLb - targetLb

  const waist = latestMeasurement(body, 'waistCm')

  return (
    <Card
      title="Current Weight"
      subtitle="7-day trend, not today's reading"
      right={<Tag kind="derived" />}
    >
      {trendLb === null ? (
        <EmptyState title="No weigh-ins yet" body="Log your weight on the Check-In tab. It takes seconds." />
      ) : (
        <>
          <div className="tnum text-4xl font-bold">
            {settings.units === 'imperial' ? `${trendLb.toFixed(1)} lb` : formatWeight(trendLb / 2.2046226218, 'metric')}
          </div>
          {change7 !== null && (
            <p
              className={`tnum mt-1 text-sm font-semibold ${
                change7 < 0 ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-muted)]'
              }`}
            >
              {change7 < 0 ? '↓' : '↑'} {Math.abs(change7).toFixed(1)} lb over 7 days
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-edge)] pt-3">
            {/* Tone follows the sign. Hardcoded "good" rendered a weight *gain*
                in accent green under the word "Lost", which at a glance reads as
                progress. PeriodDeficitCard already derives this correctly. */}
            <Stat
              label="Lost"
              value={lost === null ? '--' : `${lost.toFixed(1)} lb`}
              size="sm"
              tone={lost === null ? 'muted' : lost > 0 ? 'good' : lost < 0 ? 'bad' : 'default'}
            />
            <Stat label="To target" value={toGo === null ? '--' : `${toGo.toFixed(1)} lb`} size="sm" />
            <Stat
              label="Waist"
              value={waist ? `${waist.value.toFixed(1)} cm` : '--'}
              size="sm"
              hint={waist ? new Date(`${waist.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined}
            />
          </div>
        </>
      )}
    </Card>
  )
}

// --- Nutrition --------------------------------------------------------------

export function NutritionCard() {
  const { settings } = useData()
  const today = useToday()
  const r = today?.raw

  const macros: [string, number | null, number | null][] = [
    ['Protein', r?.protein ?? null, settings.proteinTarget],
    ['Carbs', r?.carbs ?? null, settings.carbsTarget],
    ['Fat', r?.fat ?? null, settings.fatTarget],
    ['Fiber', r?.fiber ?? null, settings.fiberTarget],
  ]

  return (
    <Card title="Nutrition" subtitle="Macros are shown as logged, never adjusted" right={<Tag kind="raw" />}>
      {!r || r.rawMfpCalories === null ? (
        <EmptyState title="Nothing logged today" body="Run the MyFitnessPal sync, or enter it on Check-In." />
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <Stat label="Logged calories" value={formatInt(r.rawMfpCalories)} size="lg" />
            <div className="pb-1 text-xs text-[var(--color-muted)]">
              adjusted{' '}
              <span className="tnum font-semibold text-[var(--color-warn-text)]">
                {formatInt(r.rawMfpCalories * settings.intakeAdjustmentFactor)}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {macros.map(([label, value, target]) => (
              <div key={label}>
                <div className="tnum flex items-baseline justify-between text-xs">
                  <span className="text-[var(--color-muted)]">{label}</span>
                  <span className="font-semibold">
                    {value === null ? '--' : `${Math.round(value)} g`}
                    {target ? <span className="text-[var(--color-muted)]"> / {target} g</span> : null}
                  </span>
                </div>
                {target && value !== null && (
                  <div className="mt-1">
                    <ProgressBar percent={(value / target) * 100} height="h-1.5" />
                  </div>
                )}
              </div>
            ))}
            {r.sugar !== null && (
              <div className="tnum flex items-baseline justify-between text-xs">
                <span className="text-[var(--color-muted)]">Sugar</span>
                <span className="font-semibold">{Math.round(r.sugar)} g</span>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

// --- Activity ---------------------------------------------------------------

/**
 * How stale the Garmin figures are, in plain words.
 *
 * This exists because Garmin's servers only hold what the watch has uploaded.
 * The phone app reads the watch live over Bluetooth, so it is routinely ahead,
 * and a dashboard that quietly shows the older number looks broken when it is
 * working exactly as intended. Saying which moment the data describes removes
 * the ambiguity.
 */
function GarminFreshness({ through }: { through: string | null }) {
  if (!through) return null
  const t = Date.parse(through)
  if (!Number.isFinite(t)) return null

  const minutes = Math.floor((Date.now() - t) / 60_000)
  if (minutes < 0) return null

  const clock = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const stale = minutes >= 90

  return (
    <p className={`mt-3 text-xs ${stale ? 'text-[var(--color-warn-text)]' : 'text-[var(--color-muted)]'}`}>
      Garmin data runs through {clock}
      {stale && (
        <>
          {' '}&middot; your watch has not uploaded in{' '}
          {minutes >= 120 ? `${Math.floor(minutes / 60)} hours` : `${minutes} minutes`}. Open
          Garmin Connect on your phone to push it.
        </>
      )}
    </p>
  )
}

export function TodayActivityCard() {
  const { settings } = useData()
  const today = useToday()
  const r = today?.raw

  return (
    <Card title="Today's Activity" right={<Tag kind="raw" />}>
      {!r ? (
        <EmptyState title="No Garmin data today" body="Garmin syncs four times a day. If your watch has not uploaded recently, open Garmin Connect on your phone." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Steps" value={formatInt(r.stepsTotal)} size="md" />
          <Stat label="Before 9am" value={formatInt(r.stepsBeforeDeadline)} size="md" />
          <Stat label="Distance" value={formatDistance(r.distanceMeters, settings.units, 1)} size="md" />
          <Stat label="Active kcal" value={formatInt(r.rawGarminActiveCalories)} size="md" />
          <Stat label="Resting kcal" value={formatInt(r.rawGarminRestingCalories)} size="md" />
          <Stat label="Active min" value={formatInt(r.activeMinutes)} size="md" />
          <Stat label="Resting HR" value={r.restingHr === null ? '--' : `${Math.round(r.restingHr)}`} size="md" />
          <Stat
            label="Sleep"
            value={r.sleepSeconds === null ? '--' : formatDuration(r.sleepSeconds)}
            size="md"
            hint={r.sleepScore !== null ? `Score ${Math.round(r.sleepScore)}` : undefined}
          />
          <Stat
            label="Body Battery"
            value={
              r.bodyBatteryHigh === null ? '--' : `${Math.round(r.bodyBatteryLow ?? 0)}-${Math.round(r.bodyBatteryHigh)}`
            }
            size="md"
          />
        </div>
      )}
      {r && <GarminFreshness through={r.garminDataThrough} />}
    </Card>
  )
}

// --- Rolling period summary -------------------------------------------------

export function PeriodDeficitCard() {
  const { days } = useData()

  const since = (iso: string) => days.filter((d) => d.date >= iso)
  const yesterday = days.find((d) => d.date === daysAgoIso(1))

  const cells: [string, number | null][] = [
    ['Yesterday', yesterday?.adjustedBalance ?? null],
    ['Last 7 days', cumulativeBalance(since(daysAgoIso(6)))],
    ['Last 30 days', cumulativeBalance(since(daysAgoIso(29)))],
    ['All time', cumulativeBalance(days)],
  ]

  return (
    <Card title="Deficit Rollup" right={<Tag kind="derived" />}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map(([label, value]) => (
          <Stat
            key={label}
            label={label}
            value={value === null ? '--' : formatSigned(value)}
            size="md"
            tone={value === null ? 'muted' : value >= 0 ? 'good' : 'bad'}
          />
        ))}
      </div>
    </Card>
  )
}

export function WeekWorkoutsCard() {
  const { activities, settings } = useData()
  const week = summarize(filterActivities(activities, resolveRange('week')))

  return (
    <Card title="This Week's Training">
      {week.count === 0 ? (
        <EmptyState title="No workouts logged this week" body="Garmin activities import automatically." />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Sessions" value={formatInt(week.count)} size="md" />
          <Stat label="Time" value={formatDuration(week.totalSeconds)} size="md" />
          <Stat label="Distance" value={formatDistance(week.totalMeters, settings.units, 1)} size="md" />
        </div>
      )}
    </Card>
  )
}
