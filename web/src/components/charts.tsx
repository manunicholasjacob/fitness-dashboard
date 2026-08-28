import type { ReactElement, ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChartTheme, type ChartTheme } from './useChartTheme'

/**
 * Chart wrappers.
 *
 * All of them share one axis, grid and tooltip treatment so the analytics pages
 * read as a single system rather than a pile of library defaults. Colours come
 * from the CSS tokens at runtime, so every chart follows the system appearance.
 *
 * A chart is a picture, and a picture is invisible to a screen reader. Each one
 * therefore takes a `summary`: a sentence stating what the data actually shows,
 * rendered for sighted readers and exposed as the chart's accessible label.
 */

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

const int = (n: number) => Math.round(n).toLocaleString('en-US')

// Recharts hands tooltip callbacks loosely-typed values (and arrays, for
// stacked series), so everything is coerced at the boundary.
const asNumber = (v: unknown): number => {
  const raw = Array.isArray(v) ? v[0] : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
const asLabel = (v: unknown): string => shortDate(String(v ?? ''))

function axisProps(t: ChartTheme) {
  return {
    stroke: t.axis,
    fontSize: 11,
    tickLine: false,
    axisLine: false,
    // Tabular figures keep axis labels from shifting as the domain changes.
    style: { fontVariantNumeric: 'tabular-nums' },
  } as const
}

/**
 * An axis label that survives a small domain.
 *
 * Formatting everything as thousands renders "0k 0k 0k 0k" whenever the range
 * is under a thousand, which is exactly where a new mission starts: four
 * identical labels claiming the axis has no scale. Below 2,000 the axis shows
 * real numbers, and only compacts once compaction is telling the truth.
 */
function compactTick(v: number, domainSpan: number): string {
  if (domainSpan >= 2000) return `${Math.round(v / 1000)}k`
  return Math.round(v).toLocaleString('en-US')
}

/** The span a numeric series covers, used to choose the tick format. */
function spanOf(values: number[]): number {
  if (values.length === 0) return 0
  let lo = values[0]
  let hi = values[0]
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return Math.abs(hi - lo)
}
function gridProps(t: ChartTheme) {
  return { stroke: t.grid, strokeDasharray: '3 3', vertical: false } as const
}
function tooltipProps(t: ChartTheme) {
  return {
    contentStyle: {
      background: t.tooltipBg,
      border: `1px solid ${t.edge}`,
      borderRadius: 12,
      fontSize: 12,
      color: t.text,
    },
    labelStyle: { color: t.muted, fontSize: 11 },
    cursor: { stroke: t.grid },
  } as const
}

/**
 * Wraps a chart with its text alternative.
 *
 * `role="img"` plus the summary means a screen reader gets the finding rather
 * than a soup of unlabelled SVG paths.
 */
export function ChartFrame({
  height = 220,
  summary,
  children,
}: {
  height?: number
  summary: string
  children: ReactElement
}) {
  return (
    /*
     * min-w-0 and overflow-hidden are both load-bearing.
     *
     * A grid or flex item defaults to min-width:auto, so it refuses to shrink
     * below its content. ResponsiveContainer measures that parent, sizes the SVG
     * to it, and the measurement then becomes the content width the parent will
     * not go below. The result is a chart that grows with the window and never
     * shrinks back: narrowing a laptop window from 1280 to 1024 left the page
     * scrolling 64px sideways, while a fresh load at either width was clean.
     *
     * min-w-0 lets the parent shrink; overflow-hidden stops the SVG pushing the
     * page out during the frame before Recharts re-measures.
     */
    <figure className="m-0 min-w-0">
      <div
        style={{ width: '100%', height }}
        className="min-w-0 overflow-hidden"
        role="img"
        aria-label={summary}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-[var(--color-muted)]">{summary}</figcaption>
    </figure>
  )
}

/** Cumulative mission progress against the target line. */
export function CumulativeChart({
  data,
  target,
  height = 240,
}: {
  data: { date: string; cumulative: number }[]
  target: number
  height?: number
}) {
  const t = useChartTheme()
  const latest = data.length ? data[data.length - 1].cumulative : 0
  const pct = target > 0 ? (latest / target) * 100 : 0
  // Only the data: a ReferenceLine does not extend the axis domain, so the
  // target must not influence how the ticks are formatted.
  const span = spanOf([...data.map((d) => d.cumulative), 0])
  const summary =
    `Cumulative adjusted deficit across ${data.length} days, now ${int(latest)} kcal, ` +
    `${pct.toFixed(1)}% of the ${int(target)} kcal target.`

  return (
    <ChartFrame height={height} summary={summary}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.positive} stopOpacity={0.45} />
            <stop offset="100%" stopColor={t.positive} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps(t)} minTickGap={28} />
        <YAxis tickFormatter={(v) => compactTick(v, span)} {...axisProps(t)} width={48} />
        <Tooltip
          {...tooltipProps(t)}
          formatter={(v: unknown) => [`${int(asNumber(v))} kcal`, 'Cumulative'] as [string, string]}
          labelFormatter={asLabel}
        />
        <ReferenceLine
          y={target}
          stroke={t.warn}
          strokeDasharray="4 4"
          label={{ value: 'Target', fill: t.warn, fontSize: 11, position: 'insideTopRight' }}
        />
        <Area type="monotone" dataKey="cumulative" stroke={t.positive} strokeWidth={2} fill="url(#cumFill)" />
      </AreaChart>
    </ChartFrame>
  )
}

/** Daily balance bars, positive above the line and negative below it. */
export function DailyBalanceChart({
  data,
  height = 220,
}: {
  data: { date: string; balance: number | null }[]
  height?: number
}) {
  const t = useChartTheme()
  const plotted = data.filter((d) => d.balance !== null) as { date: string; balance: number }[]
  const deficits = plotted.filter((d) => d.balance >= 0).length
  const mean = plotted.length ? plotted.reduce((s, d) => s + d.balance, 0) / plotted.length : 0
  const summary =
    `Daily adjusted energy balance over ${plotted.length} complete days. ` +
    `${deficits} in deficit, ${plotted.length - deficits} in surplus, averaging ${int(mean)} kcal.`

  return (
    <ChartFrame height={height} summary={summary}>
      <BarChart data={plotted} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps(t)} minTickGap={28} />
        <YAxis {...axisProps(t)} width={48} />
        <Tooltip
          {...tooltipProps(t)}
          cursor={{ fill: `${t.grid}66` }}
          formatter={(v: unknown) =>
            [`${int(asNumber(v))} kcal`, asNumber(v) >= 0 ? 'Deficit' : 'Surplus'] as [string, string]
          }
          labelFormatter={asLabel}
        />
        <ReferenceLine y={0} stroke={t.axis} />
        <Bar dataKey="balance" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {plotted.map((d) => (
            <Cell key={d.date} fill={d.balance >= 0 ? t.positive : t.negative} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

/** Two-series comparison of expenditure against intake. */
export function IntakeVsBurnChart({
  data,
  height = 220,
  label = 'Raw',
}: {
  data: { date: string; expenditure: number | null; intake: number | null }[]
  height?: number
  label?: string
}) {
  const t = useChartTheme()
  const avg = (key: 'expenditure' | 'intake') => {
    const vals = data.map((d) => d[key]).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
  }
  const summary =
    `${label} expenditure against ${label.toLowerCase()} intake over ${data.length} days, ` +
    `averaging ${int(avg('expenditure'))} kcal out and ${int(avg('intake'))} kcal in.`

  return (
    <ChartFrame height={height} summary={summary}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps(t)} minTickGap={28} />
        <YAxis {...axisProps(t)} width={48} />
        <Tooltip {...tooltipProps(t)} labelFormatter={asLabel} formatter={(v: unknown) => `${int(asNumber(v))} kcal`} />
        <Line type="monotone" dataKey="expenditure" name="Expenditure" stroke={t.positive} strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="intake" name="Intake" stroke={t.intake} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ChartFrame>
  )
}

/** Weight readings with their rolling average and the target line. */
export function WeightChart({
  data,
  targetLb,
  unitLabel,
  height = 240,
}: {
  data: { date: string; value: number; average: number | null }[]
  targetLb: number
  unitLabel: string
  height?: number
}) {
  const t = useChartTheme()
  const withAvg = data.filter((d) => d.average !== null)
  const weightSpan = spanOf(data.flatMap((d) => [d.value, d.average ?? d.value]))
  const first = withAvg.length ? withAvg[0].average! : null
  const last = withAvg.length ? withAvg[withAvg.length - 1].average! : null
  const delta = first !== null && last !== null ? last - first : null
  const summary =
    `Body weight over ${data.length} readings. Smoothed trend ` +
    (last !== null ? `now ${last.toFixed(1)} ${unitLabel}` : 'not yet available') +
    (delta !== null ? `, ${delta <= 0 ? 'down' : 'up'} ${Math.abs(delta).toFixed(1)} ${unitLabel} over the range` : '') +
    `. Target is ${targetLb.toFixed(0)} ${unitLabel}.`

  return (
    <ChartFrame height={height} summary={summary}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps(t)} minTickGap={28} />
        {/* A two-pound range at zero decimals renders "171 171 170 170": four
            ticks, two distinct values. Below a 6 lb span the axis keeps one
            decimal so consecutive ticks stay distinguishable. */}
        <YAxis
          domain={['dataMin - 1', 'dataMax + 1']}
          tickFormatter={(v) => v.toFixed(weightSpan < 6 ? 1 : 0)}
          {...axisProps(t)}
          width={weightSpan < 6 ? 52 : 48}
        />
        <Tooltip
          {...tooltipProps(t)}
          labelFormatter={asLabel}
          formatter={(v: unknown, name: unknown) =>
            [`${asNumber(v).toFixed(1)} ${unitLabel}`, String(name)] as [string, string]
          }
        />
        <ReferenceLine
          y={targetLb}
          stroke={t.warn}
          strokeDasharray="4 4"
          label={{ value: 'Target', fill: t.warn, fontSize: 11, position: 'insideBottomRight' }}
        />
        {/* Daily readings sit behind, deliberately faint: the trend is the signal. */}
        <Line type="monotone" dataKey="value" name="Daily" stroke={t.raw} strokeWidth={1} dot={{ r: 1.5, fill: t.raw }} connectNulls />
        <Line type="monotone" dataKey="average" name="7-day avg" stroke={t.positive} strokeWidth={2.5} dot={false} connectNulls />
      </LineChart>
    </ChartFrame>
  )
}

export type SeriesTone = 'positive' | 'intake' | 'secondary' | 'tertiary'

/** Generic single-series line, used for waist, neck and body fat. */
export function SimpleLineChart({
  data,
  dataKey,
  name,
  tone = 'positive',
  unit = '',
  height = 200,
  domainPad = 1,
  summary,
}: {
  data: Record<string, unknown>[]
  dataKey: string
  name: string
  tone?: SeriesTone
  unit?: string
  height?: number
  domainPad?: number
  summary?: string
}) {
  const t = useChartTheme()
  const values = data.map((d) => d[dataKey]).filter((v): v is number => typeof v === 'number')
  const first = values[0]
  const last = values[values.length - 1]
  const auto =
    values.length > 1
      ? `${name} across ${values.length} readings, from ${first.toFixed(1)}${unit} to ${last.toFixed(1)}${unit}.`
      : `${name} has ${values.length} reading so far.`

  return (
    <ChartFrame height={height} summary={summary ?? auto}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps(t)} minTickGap={28} />
        <YAxis
          domain={[`dataMin - ${domainPad}`, `dataMax + ${domainPad}`]}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v.toFixed(0))}
          {...axisProps(t)}
          width={48}
        />
        <Tooltip
          {...tooltipProps(t)}
          labelFormatter={asLabel}
          formatter={(v: unknown) => [`${asNumber(v).toFixed(1)}${unit}`, name] as [string, string]}
        />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={t[tone]} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ChartFrame>
  )
}

/** Stacked step bars with the morning goal marked. */
export function StepsChart({
  data,
  goal,
  height = 220,
}: {
  data: { date: string; morning: number | null; total: number | null }[]
  goal: number
  height?: number
}) {
  const t = useChartTheme()
  const met = data.filter((d) => (d.morning ?? 0) >= goal).length
  const scored = data.filter((d) => d.morning !== null).length
  const stepSpan = spanOf([...data.map((d) => d.total ?? 0), 0])
  const summary =
    `Daily steps over ${data.length} days, split into steps before the morning deadline and the rest ` +
    `of the day. The goal of ${int(goal)} was met on ${met} of ${scored} days with data.`

  return (
    <ChartFrame height={height} summary={summary}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps(t)} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps(t)} minTickGap={28} />
        <YAxis tickFormatter={(v) => compactTick(v, stepSpan)} {...axisProps(t)} width={48} />
        <Tooltip
          {...tooltipProps(t)}
          cursor={{ fill: `${t.grid}66` }}
          labelFormatter={asLabel}
          formatter={(v: unknown, name: unknown) => [int(asNumber(v)), String(name)] as [string, string]}
        />
        <ReferenceLine y={goal} stroke={t.warn} strokeDasharray="4 4" />
        <Bar dataKey="morning" name="Before deadline" stackId="s" fill={t.positive} isAnimationActive={false} />
        <Bar dataKey="total" name="Rest of day" stackId="s" fill={t.raw} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  )
}

/** Shown while a lazily-loaded chart is still arriving. */
export function ChartSkeleton({ height = 240 }: { height?: number }): ReactNode {
  return (
    <div
      className="animate-pulse rounded-[var(--radius-control)] bg-[var(--color-edge)]/40"
      style={{ height }}
      aria-hidden="true"
    />
  )
}
