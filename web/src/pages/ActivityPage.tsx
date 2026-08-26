import { useMemo, useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import { Button, Card, EmptyState, Field, Stat, inputClass } from '../components/ui'
import {
  ACTIVITY_LABELS,
  filterActivities,
  resolveRange,
  runningStats,
  summarize,
  workoutStreak,
  type RangeKey,
} from '../core/activity'
import { formatDistance, formatDuration, formatInt, formatPace, pluralize } from '../core/units'
import type { ActivityType } from '../core/types'
import * as api from '../lib/api'

const RANGES: [RangeKey, string][] = [
  ['today', 'Today'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['quarter', '3 Months'],
  ['year', 'Year'],
  ['all', 'All'],
]

export function ActivityPage() {
  const { activities, settings, refresh } = useData()
  const [range, setRange] = useState<RangeKey>('month')
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all')

  const inRange = useMemo(() => filterActivities(activities, resolveRange(range)), [activities, range])
  const shown = useMemo(
    () => (typeFilter === 'all' ? inRange : inRange.filter((a) => a.activityType === typeFilter)),
    [inRange, typeFilter],
  )

  const overall = summarize(inRange)
  const running = runningStats(inRange)
  const streak = workoutStreak(activities)

  const climbing = inRange.filter((a) => a.activityType === 'climbing')
  const strength = inRange.filter((a) => a.activityType === 'strength')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {RANGES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
              range === key
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'border border-[var(--color-edge)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card title="Overview">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Workouts" value={formatInt(overall.count)} size="md" />
          <Stat label="Total time" value={formatDuration(overall.totalSeconds)} size="md" />
          <Stat label="Distance" value={formatDistance(overall.totalMeters, settings.units, 1)} size="md" />
          <Stat label="Calories" value={formatInt(overall.totalCalories)} size="md" />
          <Stat label="Avg HR" value={overall.averageHr === null ? '--' : `${Math.round(overall.averageHr)}`} size="md" />
          <Stat label="Day streak" value={formatInt(streak)} size="md" hint="Consecutive active days" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Running">
          {running.runs === 0 ? (
            <EmptyState title="No runs in range" body="Garmin runs import automatically." />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Runs" value={formatInt(running.runs)} size="md" />
              <Stat label="Distance" value={formatDistance(running.totalMeters, settings.units, 1)} size="md" />
              <Stat label="Avg pace" value={formatPace(running.averageSpeedMps, settings.units)} size="md" />
              <Stat label="Best pace" value={formatPace(running.bestSpeedMps, settings.units)} size="md" hint="800m or longer" />
              <Stat label="Longest" value={formatDistance(running.longestRunMeters, settings.units, 1)} size="md" />
              <Stat label="Time" value={formatDuration(running.totalSeconds)} size="md" />
            </div>
          )}
        </Card>

        <Card title="Climbing">
          {climbing.length === 0 ? (
            <EmptyState title="No sessions in range" body="Log climbs manually below if Garmin missed them." />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Sessions" value={formatInt(climbing.length)} size="md" />
              <Stat
                label="Total time"
                value={formatDuration(climbing.reduce((s, a) => s + a.durationSeconds, 0))}
                size="md"
              />
              <Stat
                label="Avg session"
                value={formatDuration(climbing.reduce((s, a) => s + a.durationSeconds, 0) / climbing.length)}
                size="md"
              />
              <Stat
                label="Calories"
                value={formatInt(climbing.reduce((s, a) => s + (a.calories ?? 0), 0))}
                size="md"
              />
            </div>
          )}
        </Card>

        <Card title="Strength">
          {strength.length === 0 ? (
            <EmptyState title="No sessions in range" body="Strength sessions import from Garmin." />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Sessions" value={formatInt(strength.length)} size="md" />
              <Stat
                label="Total time"
                value={formatDuration(strength.reduce((s, a) => s + a.durationSeconds, 0))}
                size="md"
              />
              <Stat
                label="Avg session"
                value={formatDuration(strength.reduce((s, a) => s + a.durationSeconds, 0) / strength.length)}
                size="md"
              />
              <Stat
                label="Calories"
                value={formatInt(strength.reduce((s, a) => s + (a.calories ?? 0), 0))}
                size="md"
              />
            </div>
          )}
        </Card>
      </div>

      <Card title="By Type">
        {Object.keys(overall.byType).length === 0 ? (
          <EmptyState title="Nothing in this range" body="Widen the range or import activities." />
        ) : (
          <div className="space-y-2">
            {Object.entries(overall.byType)
              .sort((a, b) => b[1].seconds - a[1].seconds)
              .map(([type, v]) => (
                <div key={type} className="flex items-center justify-between gap-4 border-b border-[var(--color-edge)] pb-2 last:border-0">
                  <span className="text-sm font-medium">{ACTIVITY_LABELS[type as ActivityType] ?? type}</span>
                  <span className="tnum text-xs text-[var(--color-muted)]">
                    {pluralize(v.count, 'session')} · {formatDuration(v.seconds)}
                    {v.meters > 0 ? ` · ${formatDistance(v.meters, settings.units, 1)}` : ''}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Card>

      <ManualActivityForm onSaved={refresh} />

      <Card
        title="History"
        right={
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ActivityType | 'all')}
            className="rounded-lg border border-[var(--color-edge)] bg-[var(--color-inset)] px-2 py-1 text-xs text-[var(--color-text)]"
            aria-label="Filter by activity type"
          >
            <option value="all">All types</option>
            {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        }
      >
        {shown.length === 0 ? (
          <EmptyState title="No activities" body="Nothing matches this range and filter." />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="eyebrow text-left text-[var(--color-muted)]">
                  <th className="px-2 pb-2 font-semibold">Date</th>
                  <th className="px-2 pb-2 font-semibold">Type</th>
                  <th className="px-2 pb-2 text-right font-semibold">Duration</th>
                  <th className="px-2 pb-2 text-right font-semibold">Distance</th>
                  <th className="px-2 pb-2 text-right font-semibold">Pace</th>
                  <th className="px-2 pb-2 text-right font-semibold">kcal</th>
                  <th className="px-2 pb-2 text-right font-semibold">HR</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {shown.slice(0, 200).map((a) => (
                  <tr key={a.id} className="border-t border-[var(--color-edge)]">
                    <td className="px-2 py-2 text-[var(--color-muted)]">
                      {new Date(a.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-2 py-2">
                      {/* Editable so a miscategorised Garmin import can be fixed in place. */}
                      <select
                        value={a.activityType}
                        onChange={async (e) => {
                          await api.updateActivityType(a.id, e.target.value)
                          await refresh()
                        }}
                        className="rounded border border-transparent bg-transparent text-sm hover:border-[var(--color-edge)]"
                        aria-label={`Type for activity on ${a.startTime}`}
                      >
                        {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right">{formatDuration(a.durationSeconds)}</td>
                    <td className="px-2 py-2 text-right">
                      {a.distanceMeters ? formatDistance(a.distanceMeters, settings.units, 2) : '--'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {a.activityType === 'running' || a.activityType === 'walking'
                        ? formatPace(
                            a.averageSpeedMps ??
                              (a.distanceMeters && a.durationSeconds ? a.distanceMeters / a.durationSeconds : null),
                            settings.units,
                          )
                        : '--'}
                    </td>
                    <td className="px-2 py-2 text-right">{formatInt(a.calories)}</td>
                    <td className="px-2 py-2 text-right">{a.averageHr ? Math.round(a.averageHr) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function ManualActivityForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>('climbing')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('18:00')
  const [minutes, setMinutes] = useState('60')
  const [distance, setDistance] = useState('')
  const [calories, setCalories] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    try {
      await api.saveManualActivity({
        activityType: type,
        startTime: new Date(`${date}T${time}:00`).toISOString(),
        durationSeconds: Number(minutes) * 60,
        distanceMeters: distance ? Number(distance) * 1000 : null,
        calories: calories ? Number(calories) : null,
        notes: notes.trim() || null,
      })
      await onSaved()
      setStatus('Saved.')
      setNotes('')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  return (
    <Card
      title="Log a Session Manually"
      right={
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-[var(--color-muted)] hover:underline">
          {open ? 'Close' : 'Open'}
        </button>
      }
    >
      {!open ? (
        <p className="text-xs text-[var(--color-muted)]">
          For climbing sessions and anything else the watch did not record.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} className={inputClass}>
                {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Start time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Minutes">
              <input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Distance (km)" hint="Optional">
              <input type="number" inputMode="decimal" step="0.01" value={distance} onChange={(e) => setDistance(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Calories" hint="Optional">
              <input type="number" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Notes" hint="Grades, partners, how it felt">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit">Save Session</Button>
            {status && (
              <span className={`text-xs ${status === 'Saved.' ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'}`}>
                {status}
              </span>
            )}
          </div>
        </form>
      )}
    </Card>
  )
}
