import { useData } from '../lib/data'
import { AdjustmentChain, Card, EmptyState, ProgressBar, Stat, Tag } from './ui'
import { QuickCalories } from './QuickCalories'
import {
  cumulativeBalance,
  missionProgress,
  missionTarget,
  projectMissionCompletion,
} from '../core/energy'
import { minutesUntilDeadline, morningStats } from '../core/morning'
import { dayGap, shareOfMission, stepsToClose, suggestions } from '../core/suggest'
import { latestMeasurement, weightPoints } from '../core/body'
import { rollingAverage, trendChange } from '../core/trend'
import { ACTIVITY_LABELS, filterActivities, resolveRange, summarize } from '../core/activity'
import {
  formatDistance,
  formatDuration,
  formatInt,
  formatSigned,
  formatWeight,
  kgToLb,
  pluralize,
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

/**
 * Today's goal, and what would close it.
 *
 * The mission card says how far along the whole thing is. That is the right
 * headline and the wrong thing to act on: 0.8% of 84,000 does not tell anyone
 * what to do this afternoon. This card takes the day's shortfall and turns it
 * into options with durations attached, priced from the owner's own sessions.
 *
 * It stays factual on purpose. No streak to protect, no badge, no encouragement:
 * it states the gap, states what would cover it, and stops. The estimates are
 * labelled as estimates and carry their basis, because exercise calorie figures
 * are soft and presenting them as spend-this-and-get-that would be the same
 * laundering the adjustment chain exists to prevent.
 */
export function CloseTheGapCard() {
  const { activities, settings } = useData()
  const today = useToday()
  const gap = dayGap(today, settings)
  const target = missionTarget(settings)

  const remaining = gap.remaining
  const options = remaining === null ? [] : suggestions(remaining, activities)
  const steps = remaining === null ? null : stepsToClose(remaining)

  return (
    <Card
      title="Today's Goal"
      subtitle={`${formatInt(gap.goal)} kcal deficit`}
      right={<Tag kind="estimated" />}
    >
      {/* --- Where the day stands ------------------------------------------ */}
      {gap.current === null ? (
        <div className="rounded-[var(--radius-control)] bg-[var(--color-inset)] p-4
          ring-1 ring-inset ring-[var(--color-edge)]">
          {gap.burnedSoFar === null ? (
            <p className="text-sm text-[var(--color-muted)]">
              Waiting on today&rsquo;s Garmin sync before there is a gap to close.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text)]">
                <span className="tnum font-semibold">{formatInt(gap.burnedSoFar)}</span> kcal
                burned so far, nothing logged to eat.
              </p>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Eating up to{' '}
                <span className="tnum font-semibold text-[var(--color-accent-text)]">
                  {formatInt(gap.intakeBudget)}
                </span>{' '}
                kcal today still clears the {formatInt(gap.goal)} goal.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="display text-4xl text-[var(--color-text)]">
              {formatSigned(gap.current)}
            </p>
            <p className="tnum text-sm text-[var(--color-muted)]">
              of {formatInt(gap.goal)}
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar percent={(gap.progress ?? 0) * 100} height="h-2.5" />
          </div>
        </>
      )}

      {/* --- What would close it -------------------------------------------- */}
      {gap.met ? (
        <p className="mt-4 text-sm text-[var(--color-accent-text)]">
          Today&rsquo;s goal is met. Anything further is ahead of the mission, not owed to it.
        </p>
      ) : remaining !== null && remaining > 0 ? (
        <div className="mt-4">
          <p className="text-sm text-[var(--color-text)]">
            <span className="tnum font-semibold">{formatInt(remaining)}</span> kcal to go. Any one
            of these would cover it:
          </p>

          {options.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              More than a session&rsquo;s worth. Eating less of the remainder of the day is the
              realistic lever here, not a longer workout.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {options.map((o) => (
                <li
                  key={o.type}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-control)]
                    bg-[var(--color-inset)] px-3.5 py-3 ring-1 ring-inset ring-[var(--color-edge)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      {o.minutes} min {ACTIVITY_LABELS[o.type].toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {o.rate.basis === 'personal'
                        ? `${o.rate.perMinute.toFixed(1)} kcal/min across your last ${pluralize(o.rate.sessions, 'session')}`
                        : `${o.rate.perMinute.toFixed(1)} kcal/min, reference rate: none logged yet`}
                    </p>
                  </div>
                  <p className="tnum shrink-0 text-sm font-semibold text-[var(--color-accent-text)]">
                    ~{formatInt(o.kcal)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {steps !== null && (
            <p className="mt-2.5 text-xs text-[var(--color-muted)]">
              Or about <span className="tnum font-semibold">{formatInt(steps)}</span> more steps,
              at a reference 0.045 kcal per step.
            </p>
          )}

          {options.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
              Worth about{' '}
              <span className="tnum">{shareOfMission(options[0].kcal, target).toFixed(2)}%</span> of
              the 84,000 kcal mission. Exercise calorie figures are soft, so treat these as the
              size of the effort rather than a promise.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  )
}

/**
 * The last seven days, one row each.
 *
 * The rollup above answers "how much" over a window; this answers "which day".
 * Those are different questions, and the second is the one asked when a total
 * looks wrong: it is the only view that shows *where* the missing days are
 * rather than reporting that some exist.
 *
 * Steps are here too because expenditure without them is hard to sanity-check:
 * a 3,000 kcal day on 2,000 steps usually means the watch double-counted a
 * workout, and that is visible in one glance across a column.
 */
export function RecentDaysCard() {
  const { days, settings } = useData()

  // Seven rows ending yesterday. Today is excluded deliberately: it is still
  // accumulating and already has a card of its own, and a part-finished day
  // sitting in a column of finished ones invites the wrong comparison.
  const window = Array.from({ length: 7 }, (_, i) => daysAgoIso(i + 1))
  const rows = window
    .map((iso) => days.find((d) => d.date === iso) ?? null)
    .map((d, i) => ({ iso: window[i], day: d }))

  const withData = rows.filter((r) => r.day && (r.day.rawExpenditure !== null || r.day.rawIntake !== null))
  if (withData.length === 0) {
    return (
      <Card title="Last 7 Days" right={<Tag kind="derived" />}>
        <EmptyState
          title="No days to show yet"
          body="Once Garmin has synced a full day it will appear here with its deficit."
        />
      </Card>
    )
  }

  const label = (iso: string) => {
    if (iso === daysAgoIso(1)) return 'Yesterday'
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <Card
      title="Last 7 Days"
      subtitle="Each day's burn, intake and the deficit that came out of them"
      right={<Tag kind="derived" />}
    >
      <div className="-mx-2 min-w-0 overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead>
            <tr className="eyebrow text-left text-[var(--color-muted)]">
              <th className="px-2 pb-2 font-semibold">Day</th>
              <th className="px-2 pb-2 text-right font-semibold">Burned</th>
              <th className="px-2 pb-2 text-right font-semibold">Eaten</th>
              <th className="px-2 pb-2 text-right font-semibold">Steps</th>
              <th className="px-2 pb-2 text-right font-semibold">Deficit</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map(({ iso, day }) => {
              const burned = day?.adjustedExpenditure ?? null
              const eaten = day?.adjustedIntake ?? null
              const balance = day?.adjustedBalance ?? null
              const steps = day?.raw.stepsTotal ?? null

              return (
                <tr key={iso} className="border-t border-[var(--color-edge)]">
                  <td className="px-2 py-2.5 text-[var(--color-muted)]">{label(iso)}</td>
                  <td className="px-2 py-2.5 text-right font-semibold">
                    {burned === null ? <Missing /> : formatInt(burned)}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {eaten === null ? <Missing /> : formatInt(eaten)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-[var(--color-muted)]">
                    {steps === null ? <Missing /> : formatInt(steps)}
                  </td>
                  <td
                    className={`px-2 py-2.5 text-right font-semibold ${
                      balance === null
                        ? 'text-[var(--color-muted)]'
                        : balance >= 0
                          ? 'text-[var(--color-accent-text)]'
                          : 'text-[var(--color-danger-text)]'
                    }`}
                  >
                    {balance === null ? <Missing /> : formatSigned(balance)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Name only the factors that actually do something. Listing "Garmin
          x 1.00" is the same claim-of-work the chain above stopped making. */}
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        {(() => {
          const applied = [
            settings.garminAdjustmentFactor !== 1 && `burn x ${settings.garminAdjustmentFactor.toFixed(2)}`,
            settings.intakeAdjustmentFactor !== 1 && `intake x ${settings.intakeAdjustmentFactor.toFixed(2)}`,
          ].filter(Boolean) as string[]
          if (applied.length === 0) return 'Figures as reported.'
          return `Figures as reported, with ${applied.join(' and ')}.`
        })()}{' '}
        A day needs both sides to count toward the mission.
      </p>
    </Card>
  )
}

/** A missing figure, marked as absent rather than rendered as a zero. */
function Missing() {
  return (
    <span className="text-[var(--color-muted)]" title="No data for this day">
      --
    </span>
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
