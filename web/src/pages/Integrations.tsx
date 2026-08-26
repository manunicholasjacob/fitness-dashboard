import { useState, type ChangeEvent } from 'react'
import { useData } from '../lib/data'
import { Card, EmptyState, Stat } from '../components/ui'
import { formatInt, pluralize } from '../core/units'
import { parseGarminCsv, parseMfpCsv, type ImportResult } from '../lib/importers'
import * as api from '../lib/api'

function relative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return 'unknown'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min ago`
  if (hours < 48) return `${hours}h ago`
  return `${pluralize(Math.floor(hours / 24), 'day')} ago`
}

export function Integrations() {
  const { syncLogs, daily, activities, refresh } = useData()

  const lastFor = (provider: 'garmin' | 'mfp') =>
    syncLogs.find((l) => l.provider === provider) ?? null
  const lastSuccessFor = (provider: 'garmin' | 'mfp') =>
    syncLogs.find((l) => l.provider === provider && l.status === 'success') ?? null

  const garminDays = daily.filter((d) => d.energySource === 'garmin').length
  const mfpDays = daily.filter((d) => d.nutritionSource === 'mfp').length

  return (
    <div className="space-y-4 pb-8">
      <Card
        title="How syncing works"
        subtitle="Neither service grants API access to individuals, so the sync agent is the integration"
      >
        <div className="space-y-3 text-sm text-[var(--color-soft)]">
          <p>
            Garmin's Connect Developer Program requires a legal entity and rejects personal-use
            applications. MyFitnessPal closed its public API in 2019 and is not accepting new
            developers. There is no OAuth path either service will grant you.
          </p>
          <p>
            The sync agent closes that gap. It signs into Garmin directly with the same flow the
            mobile app uses, and it reads MyFitnessPal through diary sharing, which returns the
            day's entries as JSON against a key only you hold. Neither needs a browser, so neither
            needs a machine that happens to be awake: both run in the cloud four times a day, at
            10:00, 14:00, 18:00 and 21:00 Central.
          </p>
          <p>
            Every run re-fetches the last three days rather than only today, so a missed window
            heals itself and anything logged late is picked up.
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Setup steps and the failure playbook live in{' '}
            <code className="font-mono">docs/SYNC-AGENT.md</code>.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {([
          ['garmin', 'Garmin Connect', 'Forerunner 255', garminDays] as const,
          ['mfp', 'MyFitnessPal', 'Diary sharing key', mfpDays] as const,
        ]).map(([provider, title, subtitle, dayCount]) => {
          const last = lastFor(provider)
          const lastOk = lastSuccessFor(provider)
          const staleDays = lastOk?.completedAt
            ? Math.floor((Date.now() - Date.parse(lastOk.completedAt)) / 86_400_000)
            : null

          return (
            <Card key={provider} title={title} subtitle={subtitle}>
              <div className="grid grid-cols-2 gap-4">
                <Stat
                  label="Last success"
                  value={relative(lastOk?.completedAt ?? null)}
                  size="md"
                  tone={staleDays !== null && staleDays >= 2 ? 'bad' : lastOk ? 'good' : 'muted'}
                />
                <Stat label="Days on file" value={formatInt(dayCount)} size="md" />
              </div>

              {last && last.status !== 'success' && (
                <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--color-danger-edge)] bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
                  <p className="font-semibold">Last run: {last.status}</p>
                  {last.errorMessage && <p className="mt-1 break-words">{last.errorMessage}</p>}
                </div>
              )}

              {!last && (
                <p className="mt-3 text-xs text-[var(--color-muted)]">
                  No sync has ever run. Follow the setup guide, then run{' '}
                  <code className="font-mono">
                    npm run sync:{provider === 'garmin' ? 'garmin' : 'mfp'}
                  </code>
                  .
                </p>
              )}
            </Card>
          )
        })}
      </div>

      <ImportPanel onDone={refresh} />

      <Card title="Sync History">
        {syncLogs.length === 0 ? (
          <EmptyState title="No runs recorded" body="The agent writes a log line every time it runs." />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="eyebrow text-left text-[var(--color-muted)]">
                  <th className="px-2 pb-2 font-semibold">Started</th>
                  <th className="px-2 pb-2 font-semibold">Provider</th>
                  <th className="px-2 pb-2 font-semibold">Status</th>
                  <th className="px-2 pb-2 text-right font-semibold">Records</th>
                  <th className="px-2 pb-2 font-semibold">Error</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {syncLogs.map((l, i) => (
                  <tr key={`${l.provider}-${l.startedAt}-${i}`} className="border-t border-[var(--color-edge)]">
                    <td className="px-2 py-2 text-[var(--color-muted)]">
                      {new Date(l.startedAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-2 py-2">{l.provider === 'garmin' ? 'Garmin' : 'MyFitnessPal'}</td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          l.status === 'success'
                            ? 'text-[var(--color-accent)]'
                            : l.status === 'running'
                              ? 'text-[var(--color-muted)]'
                              : 'text-[var(--color-danger)]'
                        }
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">{l.recordsImported}</td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-xs text-[var(--color-muted)]" title={l.errorMessage ?? ''}>
                      {l.errorMessage ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Coverage">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Daily records" value={formatInt(daily.length)} size="md" />
          <Stat label="With Garmin energy" value={formatInt(daily.filter((d) => d.rawGarminTotalCalories !== null).length)} size="md" />
          <Stat label="With nutrition" value={formatInt(daily.filter((d) => d.rawMfpCalories !== null).length)} size="md" />
          <Stat label="Activities" value={formatInt(activities.length)} size="md" />
        </div>
      </Card>
    </div>
  )
}

function ImportPanel({ onDone }: { onDone: () => Promise<void> }) {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handle(e: ChangeEvent<HTMLInputElement>, kind: 'garmin' | 'mfp') {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setStatus(null)
    setResult(null)
    try {
      const text = await file.text()
      const parsed = kind === 'garmin' ? parseGarminCsv(text) : parseMfpCsv(text)
      setResult(parsed)
      if (parsed.rows.length > 0) {
        const written = await api.bulkUpsertDaily(parsed.rows)
        await onDone()
        setStatus(`Imported ${pluralize(written, 'day')}.`)
      } else {
        setStatus('No usable rows found.')
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <Card
      title="CSV Import"
      subtitle="Backfill history, or cover a stretch where the agent was not running"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow text-[var(--color-muted)]">
            Garmin export
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void handle(e, 'garmin')}
            className="mt-1.5 block w-full text-xs text-[var(--color-muted)] file:mr-3 file:min-h-10 file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-edge)] file:px-4 file:text-xs file:font-semibold file:text-[var(--color-text)]"
          />
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Recognises Date, Steps, Calories, Distance and heart-rate columns.
          </span>
        </label>

        <label className="block">
          <span className="eyebrow text-[var(--color-muted)]">
            MyFitnessPal export
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void handle(e, 'mfp')}
            className="mt-1.5 block w-full text-xs text-[var(--color-muted)] file:mr-3 file:min-h-10 file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-edge)] file:px-4 file:text-xs file:font-semibold file:text-[var(--color-text)]"
          />
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Nutrition summary CSV. Multiple rows per date are summed.
          </span>
        </label>
      </div>

      {status && (
        <p className={`mt-3 text-xs ${status.startsWith('Imported') ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'}`}>
          {status}
        </p>
      )}

      {result && result.warnings.length > 0 && (
        <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--color-warn-edge)] bg-[var(--color-warn)]/10 p-3">
          <p className="text-xs font-semibold text-[var(--color-warn)]">
            {result.warnings.length} row{result.warnings.length === 1 ? '' : 's'} skipped
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-warn)]">
            {result.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {result.warnings.length > 8 && <li>...and {result.warnings.length - 8} more.</li>}
          </ul>
        </div>
      )}
    </Card>
  )
}
