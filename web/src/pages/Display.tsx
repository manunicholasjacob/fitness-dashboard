import { useEffect, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { useData } from '../lib/data'
import { missionProgress } from '../core/energy'
import { morningStats } from '../core/morning'
import { weightPoints } from '../core/body'
import { rollingAverage } from '../core/trend'
import { filterActivities, resolveRange, runningStats, summarize } from '../core/activity'
import { formatDuration, formatInt, formatSigned, kgToLb, pluralize } from '../core/units'
import { todayIso } from '../components/cards'
import { ProgressBar } from '../components/ui'

/**
 * Glanceable wall-display mode.
 *
 * Deliberately non-interactive: no navigation, no controls, oversized type,
 * meant to be read across a room from a tablet or a Pi-driven monitor.
 */
export function Display() {
  const { days, body, activities, settings, refresh } = useData()
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 30_000)
    // An always-on display has no one to pull-to-refresh it.
    const sync = setInterval(() => void refresh(), 15 * 60_000)
    return () => {
      clearInterval(tick)
      clearInterval(sync)
    }
  }, [refresh])

  const progress = missionProgress(days, settings)
  const morning = morningStats(days, settings)
  const today = days.find((d) => d.date === todayIso())

  const wPoints = weightPoints(body).map((w) => ({ date: w.date, value: kgToLb(w.weightKg) }))
  const smoothed = rollingAverage(wPoints, Math.min(7, wPoints.length || 1))
  const weightTrend = smoothed.length ? (smoothed[smoothed.length - 1].average ?? smoothed[smoothed.length - 1].value) : null

  const [params] = useSearchParams()
  const kiosk = params.get('kiosk') === '1'
  const week = summarize(filterActivities(activities, resolveRange('week')))
  const monthRun = runningStats(filterActivities(activities, resolveRange('month')))

  return (
    <div className="min-h-[100dvh] bg-[var(--color-ink)] p-6 lg:p-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--color-accent-text)] lg:text-lg">
          Energy Deficit Mission
        </h1>
        <div className="flex items-baseline gap-5">
          <p className="tnum text-sm text-[var(--color-muted)] lg:text-xl">
            {clock.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
          {/*
           * The way out.
           *
           * This route renders no navigation by design, and until now it
           * rendered no links at all. Installed to the home screen there is no
           * browser back button, so opening it once left the app with no exit
           * short of clearing site data. A kiosk is a mode; a mode needs a door.
           *
           * Quiet enough to disappear across a room, and `?kiosk=1` removes it
           * for a display that genuinely wants nothing.
           */}
          {!kiosk && (
            <NavLink
              to="/"
              // --color-muted, not --color-faint. Faint is the borders-only tier
              // and lands at 4.40:1 on the light page, which is this app's only
              // WCAG AA text failure. Quiet is a job for size and weight here,
              // not for a tone that cannot carry text.
              className="rounded-full px-3 py-1 text-xs font-medium text-[var(--color-muted)]
                transition duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
                hover:bg-[var(--color-card)] hover:text-[var(--color-text)]
                focus-visible:text-[var(--color-text)] lg:text-sm"
            >
              Exit
            </NavLink>
          )}
        </div>
      </header>

      <section className="mt-8 text-center lg:mt-12">
        {/* accent-text rather than accent: on the page ground the vivid accent
            measures 4.40:1, and this app holds large text to 4.5:1. Across a
            room the difference is invisible; in the audit it is a failure. */}
        <p className="tnum text-[22vw] font-bold leading-[0.85] text-[var(--color-accent-text)] lg:text-[16rem]">
          {progress.percent.toFixed(1)}
          <span className="text-[8vw] lg:text-[6rem]">%</span>
        </p>
        <p className="tnum mt-4 text-xl text-[var(--color-text)] lg:text-4xl">
          {formatInt(progress.accumulated)}{' '}
          <span className="text-[var(--color-muted)]">/ {formatInt(progress.target)} kcal</span>
        </p>
        <div className="mx-auto mt-6 max-w-4xl">
          <ProgressBar percent={progress.percent} height="h-5 lg:h-8" />
        </div>
        <p className="tnum mt-4 text-base text-[var(--color-muted)] lg:text-2xl">
          {formatInt(progress.remaining)} kcal remaining
        </p>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-4 lg:mt-16 lg:grid-cols-3 lg:gap-8">
        <Tile
          label="Today's Deficit"
          value={today?.adjustedBalance == null ? '--' : formatSigned(today.adjustedBalance)}
          tone={today?.adjustedBalance == null ? 'muted' : today.adjustedBalance >= 0 ? 'good' : 'bad'}
        />
        <Tile
          label="Current Weight"
          value={weightTrend === null ? '--' : `${weightTrend.toFixed(1)}`}
          suffix="lb"
          sub="7-day trend"
        />
        <Tile
          label="Morning Mission"
          value={
            morning.todayStepsBeforeDeadline === null
              ? '--'
              : formatInt(morning.todayStepsBeforeDeadline)
          }
          suffix={`/ ${formatInt(morning.goal)}`}
          tone={morning.todayMet ? 'good' : 'muted'}
          sub={morning.currentStreak > 0 ? `${morning.currentStreak} day streak` : undefined}
        />
        <Tile label="Today's Steps" value={formatInt(today?.raw.stepsTotal ?? null)} />
        <Tile
          label="This Week's Workouts"
          value={formatInt(week.count)}
          sub={week.count > 0 ? formatDuration(week.totalSeconds) : undefined}
        />
        <Tile
          label="Running This Month"
          value={monthRun.totalMiles.toFixed(1)}
          suffix="mi"
          sub={pluralize(monthRun.runs, 'run')}
        />
      </section>
    </div>
  )
}

function Tile({
  label,
  value,
  suffix,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  suffix?: string
  sub?: string
  tone?: 'default' | 'good' | 'bad' | 'muted'
}) {
  // Every figure on this screen is display type read from across a room, so
  // the large-text threshold applies and the vivid tones are the right ones.
  const color = {
    default: 'text-[var(--color-text)]',
    good: 'text-[var(--color-accent)]',
    bad: 'text-[var(--color-danger)]',
    muted: 'text-[var(--color-muted)]',
  }[tone]

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-edge)] bg-[var(--color-card)] p-5 lg:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] lg:text-sm">
        {label}
      </p>
      <p className={`tnum mt-2 text-4xl font-bold leading-none lg:text-7xl ${color}`}>
        {value}
        {suffix && <span className="ml-2 text-lg text-[var(--color-muted)] lg:text-3xl">{suffix}</span>}
      </p>
      {sub && <p className="mt-2 text-xs text-[var(--color-muted)] lg:text-lg">{sub}</p>}
    </div>
  )
}
