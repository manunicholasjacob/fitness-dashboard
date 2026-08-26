import { useData } from '../lib/data'
import { Card, ProgressBar, Stat, Tag } from '../components/ui'
import { MissionCard } from '../components/cards'
import { CumulativeChart, DailyBalanceChart } from '../components/charts'
import { cumulativeSeries, missionProgress, missionTarget } from '../core/energy'
import { realityCheck } from '../core/realitycheck'
import { formatInt, formatSigned, kgToLb } from '../core/units'
import { weightPoints } from '../core/body'
import { rollingAverage } from '../core/trend'

export function Mission() {
  const { days, body, settings } = useData()
  const progress = missionProgress(days, settings)
  const target = missionTarget(settings)
  const check = realityCheck(days, body, settings)

  const poundsToLose = kgToLb(settings.startingWeightKg) - kgToLb(settings.targetWeightKg)
  const theoretical = poundsToLose * settings.caloriesPerPound

  const wPoints = weightPoints(body).map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))
  const smoothed = rollingAverage(wPoints, Math.min(7, wPoints.length || 1))
  const currentTrend = smoothed.length ? (smoothed[smoothed.length - 1].average ?? smoothed[smoothed.length - 1].value) : null

  return (
    <div className="space-y-4">
      <MissionCard />

      <Card title="How the target is built" right={<Tag kind="derived" />}>
        <div className="tnum space-y-2 font-mono text-sm">
          <Row label="Weight to lose" value={`${poundsToLose.toFixed(1)} lb`} />
          <Row label="Calories per pound" value={formatInt(settings.caloriesPerPound)} />
          <Row label="Theoretical deficit" value={`${formatInt(theoretical)} kcal`} />
          <Row label={`Uncertainty buffer (+${settings.missionBufferPercent}%)`} value={`x ${(1 + settings.missionBufferPercent / 100).toFixed(2)}`} />
          <div className="border-t border-[var(--color-edge)] pt-2">
            <Row label="Mission target" value={`${formatInt(target)} kcal`} strong />
          </div>
        </div>
        {settings.missionTargetOverride !== null && (
          <p className="mt-3 text-xs text-[var(--color-warn)]">
            A manual override of {formatInt(settings.missionTargetOverride)} kcal is active, so the
            derivation above is not what the dashboard uses.
          </p>
        )}
      </Card>

      {/* The distinction the whole spec insists on: model progress is not weight change. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mission Progress" subtitle="What the calorie model says" right={<Tag kind="derived" />}>
          <Stat label="Accumulated" value={`${formatInt(progress.accumulated)} kcal`} size="lg" tone="good" />
          <div className="mt-3">
            <ProgressBar percent={progress.percent} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Theoretical loss" value={`${progress.theoreticalPoundsLost.toFixed(2)} lb`} size="sm" />
            <Stat label="Remaining" value={`${formatInt(progress.remaining)} kcal`} size="sm" />
          </div>
        </Card>

        <Card title="Actual Body Weight" subtitle="What the scale says" right={<Tag kind="raw" />}>
          <Stat
            label="7-day trend"
            value={currentTrend === null ? '--' : `${currentTrend.toFixed(1)} lb`}
            size="lg"
          />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat
              label="Lost since start"
              value={currentTrend === null ? '--' : `${(kgToLb(settings.startingWeightKg) - currentTrend).toFixed(1)} lb`}
              size="sm"
            />
            <Stat
              label="To target"
              value={currentTrend === null ? '--' : `${(currentTrend - kgToLb(settings.targetWeightKg)).toFixed(1)} lb`}
              size="sm"
            />
          </div>
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            These two cards measure different things. A calculated deficit is a model of energy
            balance, not a guarantee of fat loss.
          </p>
        </Card>
      </div>

      <Card
        title="Model Check"
        subtitle={`Comparing the last ${check.windowDays} days`}
        right={<Tag kind="estimated" />}
      >
        {check.verdict === 'insufficient-data' ? (
          <p className="text-sm text-[var(--color-muted)]">{check.message}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Predicted loss" value={`${check.predictedLossLb!.toFixed(1)} lb`} size="md" />
              <Stat label="Observed loss" value={`${check.observedLossLb!.toFixed(1)} lb`} size="md" />
              <Stat
                label="Difference"
                value={`${check.differenceLb! > 0 ? '+' : ''}${check.differenceLb!.toFixed(1)} lb`}
                size="md"
                tone={check.verdict === 'aligned' ? 'good' : 'bad'}
              />
              <Stat
                label="Trend fit"
                value={check.trendR2 === null ? '--' : check.trendR2.toFixed(2)}
                size="md"
                hint="R-squared of the weight line"
              />
            </div>
            <p
              className={`mt-4 rounded-[var(--radius-control)] border p-3 text-sm ${
                check.verdict === 'aligned'
                  ? 'border-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'border-[var(--color-warn-edge)] text-[var(--color-warn)]'
              }`}
            >
              {check.message}
            </p>
            {check.impliedBalanceScalar !== null && check.verdict !== 'aligned' && (
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                Scaling your daily balance by {check.impliedBalanceScalar.toFixed(2)} would have
                reconciled the model with the scale over this window. Nothing has been changed
                automatically. Adjust the factors in Settings if you agree with the reading.
              </p>
            )}
          </>
        )}
      </Card>

      <Card title="Cumulative Progress">
        {days.length > 1 ? (
          <CumulativeChart data={cumulativeSeries(days)} target={target} height={280} />
        ) : (
          <p className="py-12 text-center text-xs text-[var(--color-muted)]">Not enough data yet.</p>
        )}
      </Card>

      <Card title="Daily Adjusted Balance" subtitle="Green is a deficit, red is a surplus">
        {days.some((d) => d.isComplete) ? (
          <DailyBalanceChart data={days.map((d) => ({ date: d.date, balance: d.adjustedBalance }))} height={240} />
        ) : (
          <p className="py-12 text-center text-xs text-[var(--color-muted)]">
            No complete days yet. A day needs both Garmin and nutrition data.
          </p>
        )}
      </Card>

      {progress.incompleteDays > 0 && (
        <p className="pb-2 text-center text-xs text-[var(--color-muted)]">
          {progress.incompleteDays} of {days.length} recorded days are incomplete and contribute{' '}
          {formatSigned(0)} to the mission.
        </p>
      )}
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className={strong ? 'text-lg font-bold text-[var(--color-accent)]' : 'font-semibold'}>{value}</span>
    </div>
  )
}
