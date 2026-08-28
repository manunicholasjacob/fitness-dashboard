import { useEffect, useState } from 'react'
import type { Milestone, Rank, RingSpec } from '../core/game'

/**
 * Game graphics.
 *
 * Drawn as SVG rather than assembled from divs, because these are instruments:
 * an arc that has to be exactly 62% of the way round, a track whose markers sit
 * at real thresholds. Everything is themed from the same tokens as the rest of
 * the app, so the game layer does not arrive with its own palette.
 *
 * Motion here is the one place the app spends any. A ring that draws itself is
 * showing you the value arriving; a ring that is simply there is a static
 * picture of a number you already had. It runs once on mount, is skipped
 * entirely under prefers-reduced-motion, and animates stroke-dashoffset, which
 * the compositor handles.
 */

/** Ring colours, in draw order. Graphics, so they answer to 3:1, not 7:1. */
const RING_TOKENS: Record<RingSpec['key'], { track: string; fill: string }> = {
  deficit: { track: 'var(--ring-track)', fill: 'var(--color-accent)' },
  morning: { track: 'var(--ring-track)', fill: 'var(--color-chart-intake)' },
  protein: { track: 'var(--ring-track)', fill: 'var(--color-chart-secondary)' },
}

/** Respects the user's motion preference, and reacts if they change it. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Concentric activity rings.
 *
 * Each ring is a circle stroked round from twelve o'clock, its length set by
 * stroke-dasharray and revealed by animating stroke-dashoffset. Round caps, so
 * a barely-started ring still reads as a mark rather than vanishing.
 */
export function ActivityRings({
  rings,
  size = 168,
  strokeWidth = 13,
  gap = 5,
}: {
  rings: RingSpec[]
  size?: number
  strokeWidth?: number
  gap?: number
}) {
  const reduced = usePrefersReducedMotion()
  const [drawn, setDrawn] = useState(reduced)

  useEffect(() => {
    if (reduced) {
      setDrawn(true)
      return
    }
    // One frame at zero, so the browser has a value to animate away from.
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [reduced])

  const centre = size / 2
  const summary = rings
    .map((r) => `${r.label} ${r.known ? `${Math.round(r.progress * 100)} percent` : 'no data yet'}`)
    .join('. ')

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`Today's rings. ${summary}.`}
      className="shrink-0"
    >
      {/* Twelve o'clock start. Rotating the whole group keeps every ring
          consistent without recomputing each arc's phase. */}
      <g transform={`rotate(-90 ${centre} ${centre})`}>
        {rings.map((ring, i) => {
          const radius = centre - strokeWidth / 2 - i * (strokeWidth + gap)
          if (radius <= 0) return null
          const circumference = 2 * Math.PI * radius
          const shown = drawn ? ring.progress : 0
          const tokens = RING_TOKENS[ring.key]

          return (
            <g key={ring.key}>
              <circle
                cx={centre}
                cy={centre}
                r={radius}
                fill="none"
                stroke={tokens.track}
                strokeWidth={strokeWidth}
              />
              {ring.progress > 0 && (
                <circle
                  cx={centre}
                  cy={centre}
                  r={radius}
                  fill="none"
                  stroke={tokens.fill}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - shown)}
                  style={{
                    transition: reduced
                      ? undefined
                      : `stroke-dashoffset 900ms cubic-bezier(0.32, 0.72, 0, 1) ${i * 90}ms`,
                  }}
                />
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

/** The readout beside the rings: one row per ring, colour-keyed to its arc. */
export function RingLegend({ rings }: { rings: RingSpec[] }) {
  return (
    <ul className="grid min-w-0 flex-1 gap-2.5">
      {rings.map((ring) => (
        <li key={ring.key} className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: RING_TOKENS[ring.key].fill }}
            />
            <span className="eyebrow text-[var(--color-muted)]">{ring.label}</span>
            {ring.closed && (
              <span className="text-[11px] font-semibold text-[var(--color-accent-text)]">
                closed
              </span>
            )}
          </div>
          <p
            className={`tnum mt-0.5 pl-[1.125rem] text-sm font-semibold ${
              ring.known ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'
            }`}
          >
            {ring.readout}
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * The mission as a track of pound-markers.
 *
 * Twenty-four dots, one per theoretical pound, is the whole 84,000 rendered at
 * a scale a person can count. The next marker is ringed rather than filled, so
 * the eye lands on the one that is actually in play rather than on the distant
 * end of the row.
 */
export function MilestoneTrack({
  milestones,
  accumulated,
  perPound,
}: {
  milestones: Milestone[]
  accumulated: number
  perPound: number
}) {
  const reached = milestones.filter((m) => m.reached).length
  const next = milestones.find((m) => m.next) ?? null
  const toNext = next === null ? null : Math.max(0, next.at - accumulated)

  return (
    <div>
      <ol
        className="flex flex-wrap gap-1.5"
        aria-label={`${reached} of ${milestones.length} pound markers reached`}
      >
        {milestones.map((m) => (
          <li
            key={m.at}
            title={`${m.label} at ${Math.round(m.at).toLocaleString('en-US')} kcal${
              m.reached ? ', reached' : ''
            }`}
            className={`h-6 flex-1 rounded-[5px] transition-colors duration-300 ${
              m.reached
                ? 'bg-[var(--color-accent)]'
                : m.next
                  ? // The marker in play. A pale tint alone read as "slightly
                    // less empty" against the unfilled ones; the solid accent
                    // ring is what makes the eye land here rather than on the
                    // far end of the row.
                    'bg-[var(--color-accent-quiet)] ring-2 ring-inset ring-[var(--color-accent)]'
                  : 'bg-[var(--color-inset)] ring-1 ring-inset ring-[var(--color-edge)]'
            }`}
          />
        ))}
      </ol>

      <div className="mt-2.5 flex items-baseline justify-between gap-3 text-xs text-[var(--color-muted)]">
        <span className="tnum">
          <span className="font-semibold text-[var(--color-text)]">{reached}</span> of{' '}
          {milestones.length} lb markers
        </span>
        {toNext !== null && (
          <span className="tnum">
            {Math.round(toNext).toLocaleString('en-US')} kcal to {next!.label}
          </span>
        )}
      </div>

      {/* Stated because the markers are pounds of deficit, not pounds on the
          scale, and a row of filled squares invites exactly that reading. */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-muted)]">
        One marker per {Math.round(perPound).toLocaleString('en-US')} kcal banked. These are
        theoretical pounds, not scale readings.
      </p>
    </div>
  )
}

/**
 * The rank badge: a small progress dial with the level inside it.
 *
 * A number in a ring rather than a medal or a gem, because the level is a
 * restatement of a measured quantity and dressing it as treasure would be the
 * first place this stopped being honest.
 */
export function RankBadge({ rank, size = 74 }: { rank: Rank; size?: number }) {
  const reduced = usePrefersReducedMotion()
  const [drawn, setDrawn] = useState(reduced)

  useEffect(() => {
    if (reduced) {
      setDrawn(true)
      return
    }
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [reduced])

  const stroke = 6
  const centre = size / 2
  const radius = centre - stroke / 2
  const circumference = 2 * Math.PI * radius
  const shown = drawn ? rank.progress : 0

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <g transform={`rotate(-90 ${centre} ${centre})`}>
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={stroke}
          />
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown)}
            style={{
              transition: reduced
                ? undefined
                : 'stroke-dashoffset 900ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="eyebrow leading-none text-[var(--color-muted)]">Lvl</span>
        <span className="tnum text-xl font-bold leading-tight tracking-[-0.02em]">
          {rank.level}
        </span>
      </div>
    </div>
  )
}

/** A run of days, as a chip row. Filled means the goal was met that day. */
export function StreakChips({
  days,
  goal,
}: {
  days: { date: string; balance: number | null; complete: boolean }[]
  goal: number
}) {
  return (
    <ol className="flex gap-1.5" aria-label={`The last ${days.length} days against the daily goal`}>
      {days.map((d) => {
        const met = d.complete && d.balance !== null && d.balance >= goal
        const missed = d.complete && !met
        const label = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'short',
          day: 'numeric',
        })
        return (
          <li
            key={d.date}
            title={`${label}: ${
              !d.complete
                ? 'incomplete, no deficit could be worked out'
                : `${Math.round(d.balance!)} kcal, goal ${goal}`
            }`}
            className={`h-8 flex-1 rounded-[var(--radius-inner)] ${
              met
                ? 'bg-[var(--color-accent)]'
                : missed
                  ? 'bg-[var(--color-warn)]/35 ring-1 ring-inset ring-[var(--color-warn-edge)]'
                  : 'bg-[var(--color-inset)] ring-1 ring-inset ring-[var(--color-edge)]'
            }`}
          />
        )
      })}
    </ol>
  )
}
