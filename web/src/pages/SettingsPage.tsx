import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Button, Card, Field, Stat, inputClass } from '../components/ui'
import { missionTarget } from '../core/energy'
import { formatInt, kgToLb, lbToKg } from '../core/units'
import type { Settings } from '../core/types'
import { settingsSchema } from '../core/settings'
import * as api from '../lib/api'
import { generateDemoData } from '../lib/demo'
import { clearCache } from '../lib/cache'
import { PIN_LENGTH, hashPin, lock } from '../lib/pin'

export function SettingsPage() {
  const { settings, updateSettings, refresh } = useData()
  const { signOut } = useAuth()
  const [draft, setDraft] = useState<Settings>(settings)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Adopt server state when it arrives, but never stomp on an in-progress edit.
  useEffect(() => {
    setDraft((d) => (JSON.stringify(d) === JSON.stringify(settings) ? d : settings))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const num = (v: string, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  async function save() {
    setBusy(true)
    setStatus(null)
    const parsed = settingsSchema.safeParse(draft)
    if (!parsed.success) {
      setStatus(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
      setBusy(false)
      return
    }
    try {
      await updateSettings(draft)
      setStatus('Saved.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const previewTarget = missionTarget(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  return (
    <div className="space-y-4 pb-8">
      <Card title="Mission" subtitle="The target recalculates from these unless you set an override">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Starting weight (lb)">
            <input type="number" step="0.1" className={inputClass}
              value={kgToLb(draft.startingWeightKg).toFixed(1)}
              onChange={(e) => set('startingWeightKg', lbToKg(num(e.target.value, 170)))} />
          </Field>
          <Field label="Target weight (lb)">
            <input type="number" step="0.1" className={inputClass}
              value={kgToLb(draft.targetWeightKg).toFixed(1)}
              onChange={(e) => set('targetWeightKg', lbToKg(num(e.target.value, 150)))} />
          </Field>
          <Field label="Calories per pound">
            <input type="number" className={inputClass} value={draft.caloriesPerPound}
              onChange={(e) => set('caloriesPerPound', num(e.target.value, 3500))} />
          </Field>
          <Field label="Mission buffer (%)" hint="Uncertainty margin on top of the theoretical figure">
            <input type="number" className={inputClass} value={draft.missionBufferPercent}
              onChange={(e) => set('missionBufferPercent', num(e.target.value, 20))} />
          </Field>
          <Field label="Starting body fat (%)">
            <input type="number" step="0.1" className={inputClass} value={draft.startingBodyFatPercent}
              onChange={(e) => set('startingBodyFatPercent', num(e.target.value, 20))} />
          </Field>
          <Field label="Target body fat range (%)">
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" className={inputClass} value={draft.targetBodyFatMin}
                onChange={(e) => set('targetBodyFatMin', num(e.target.value, 10))} />
              <span className="text-[var(--color-muted)]">to</span>
              <input type="number" step="0.1" className={inputClass} value={draft.targetBodyFatMax}
                onChange={(e) => set('targetBodyFatMax', num(e.target.value, 12))} />
            </div>
          </Field>
          <Field label="Mission target override (kcal)" hint="Leave blank to use the derived value">
            <input type="number" className={inputClass}
              value={draft.missionTargetOverride ?? ''}
              placeholder={String(missionTarget({ ...draft, missionTargetOverride: null }))}
              onChange={(e) =>
                set('missionTargetOverride', e.target.value.trim() === '' ? null : num(e.target.value, 84000))
              } />
          </Field>
          <Field label="Height (cm)">
            <input type="number" step="0.1" className={inputClass} value={draft.heightCm}
              onChange={(e) => set('heightCm', num(e.target.value, 170))} />
          </Field>
          <Field label="Sex" hint="Selects the Navy body-fat formula">
            <select className={inputClass} value={draft.sex}
              onChange={(e) => set('sex', e.target.value as Settings['sex'])}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-accent-dim)] bg-[var(--color-inset)] p-3">
          <Stat label="Resulting mission target" value={`${formatInt(previewTarget)} kcal`} size="md" tone="good" />
        </div>
      </Card>

      <Card
        title="Adjustment Assumptions"
        subtitle="Planning figures, not measurements. Changing them re-prices all history without touching raw data."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Garmin calorie factor"
            hint={`Reported calories x ${draft.garminAdjustmentFactor.toFixed(2)}. Default 0.85.`}
          >
            <input type="number" step="0.01" min="0.3" max="1.5" className={inputClass}
              value={draft.garminAdjustmentFactor}
              onChange={(e) => set('garminAdjustmentFactor', num(e.target.value, 0.85))} />
          </Field>
          <Field
            label="MyFitnessPal intake factor"
            hint={`Logged calories x ${draft.intakeAdjustmentFactor.toFixed(2)}. Default 1.10.`}
          >
            <input type="number" step="0.01" min="0.5" max="2" className={inputClass}
              value={draft.intakeAdjustmentFactor}
              onChange={(e) => set('intakeAdjustmentFactor', num(e.target.value, 1.1))} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          At 2,800 reported and 2,000 logged, these give{' '}
          <span className="tnum font-semibold text-[var(--color-text)]">
            {formatInt(2800 * draft.garminAdjustmentFactor - 2000 * draft.intakeAdjustmentFactor)} kcal
          </span>{' '}
          for the day.
        </p>
      </Card>

      <Card title="Morning Mission">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Target steps">
            <input type="number" className={inputClass} value={draft.morningStepGoal}
              onChange={(e) => set('morningStepGoal', Math.round(num(e.target.value, 7000)))} />
          </Field>
          <Field label="Deadline">
            <input type="time" className={inputClass} value={draft.morningDeadline}
              onChange={(e) => set('morningDeadline', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Macro Targets" subtitle="Leave blank to hide a progress bar">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {([
            ['proteinTarget', 'Protein (g)'],
            ['carbsTarget', 'Carbs (g)'],
            ['fatTarget', 'Fat (g)'],
            ['fiberTarget', 'Fiber (g)'],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="number" className={inputClass} value={draft[key] ?? ''}
                onChange={(e) => set(key, e.target.value.trim() === '' ? null : num(e.target.value, 0))} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Units and Locale">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Weight and distance">
            <select className={inputClass} value={draft.units}
              onChange={(e) => set('units', e.target.value as Settings['units'])}>
              <option value="imperial">Pounds and miles</option>
              <option value="metric">Kilograms and kilometres</option>
            </select>
          </Field>
          <Field label="Circumferences">
            <select className={inputClass} value={draft.lengthUnits}
              onChange={(e) => set('lengthUnits', e.target.value as Settings['units'])}>
              <option value="metric">Centimetres</option>
              <option value="imperial">Inches</option>
            </select>
          </Field>
          <Field label="Timezone" hint="Used to decide which day is today">
            <input className={inputClass} value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} />
          </Field>
          <Field label="Display name">
            <input className={inputClass} value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} />
          </Field>
          <Field label="Mission start date">
            <input type="date" className={inputClass} value={draft.startDate}
              onChange={(e) => set('startDate', e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* Sticky so the save button is always reachable on a long mobile page. */}
      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-edge)] material bg-[var(--color-surface)]/95 p-3 backdrop-blur md:bottom-4">
        <Button onClick={save} disabled={busy || !dirty} className="flex-1">
          {busy ? 'Saving...' : dirty ? 'Save Settings' : 'Saved'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(settings)}>
            Discard
          </Button>
        )}
        {status && (
          <span className={`text-xs ${status === 'Saved.' ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'}`}>
            {status}
          </span>
        )}
      </div>

      <DataSection onChanged={refresh} />

      <UnlockCodeCard />

      <Card title="Account">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              lock()
              window.location.reload()
            }}
          >
            Lock now
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Locking asks for the code again. Signing out clears the session, so the next
          visit needs the full email and password.
        </p>
      </Card>
    </div>
  )
}

function DataSection({ onChanged }: { onChanged: () => Promise<void> }) {
  const { daily, body, activities } = useData()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasDemo =
    daily.some((d) => d.isDemo) ||
    body.some((b) => b.source === 'demo') ||
    activities.some((a) => a.externalSource === 'demo')

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true)
    setStatus(null)
    try {
      await fn()
      await onChanged()
      setStatus(`${label} complete.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : `${label} failed.`)
    } finally {
      setBusy(false)
    }
  }

  async function doExport() {
    const payload = await api.exportEverything()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mission-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function loadDemo() {
    const demo = generateDemoData(45)
    await api.bulkUpsertDaily(demo.daily)
    await api.bulkUpsertBody(demo.body)
    await api.bulkInsertDemoActivities(demo.activities)
  }

  return (
    <Card title="Data">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => void run('Export', doExport)}>
          Export all data (JSON)
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void run('Refresh', onChanged)}>
          Force refresh
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            clearCache()
            setStatus('Local cache cleared.')
          }}
        >
          Clear local cache
        </Button>
        {!hasDemo ? (
          <Button variant="ghost" disabled={busy} onClick={() => void run('Demo load', loadDemo)}>
            Load demo data
          </Button>
        ) : (
          <Button variant="danger" disabled={busy} onClick={() => void run('Demo removal', api.clearDemoData)}>
            Remove demo data
          </Button>
        )}
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (confirm('Delete all metrics, check-ins and activities? Settings are kept. This cannot be undone.')) {
              void run('Delete', api.clearAllData)
            }
          }}
        >
          Delete all data
        </Button>
      </div>
      {status && <p className="mt-3 text-xs text-[var(--color-muted)]">{status}</p>}
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        {daily.length} daily records · {body.length} check-ins · {activities.length} activities
      </p>
    </Card>
  )
}

/**
 * Changing the unlock code.
 *
 * Only the hash is stored, and only the hash ever leaves the browser. The code
 * itself is never written to the database or sent anywhere.
 */
function UnlockCodeCard() {
  const { settings, updateSettings } = useData()
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, PIN_LENGTH)
  const complete = code.length === PIN_LENGTH
  const matches = complete && code === confirm

  async function save() {
    setBusy(true)
    setStatus(null)
    try {
      await updateSettings({ ...settings, unlockPinHash: await hashPin(code) })
      setStatus('Unlock code updated.')
      setCode('')
      setConfirm('')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function removeCode() {
    setBusy(true)
    setStatus(null)
    try {
      await updateSettings({ ...settings, unlockPinHash: null })
      setStatus('Lock screen removed. Anyone with this device can open the app.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Unlock Code"
      subtitle={
        settings.unlockPinHash
          ? `${PIN_LENGTH} digits, asked for each time you open the app`
          : 'No lock screen is set'
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New code">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={code}
            onChange={(e) => setCode(digitsOnly(e.target.value))}
            placeholder={'0'.repeat(PIN_LENGTH)}
            className={`${inputClass} tnum text-xl tracking-[0.4em]`}
          />
        </Field>
        <Field
          label="Confirm"
          error={confirm.length === PIN_LENGTH && !matches ? 'Codes do not match' : null}
        >
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(digitsOnly(e.target.value))}
            placeholder={'0'.repeat(PIN_LENGTH)}
            className={`${inputClass} tnum text-xl tracking-[0.4em]`}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!matches || busy}>
          {busy ? 'Saving...' : 'Set code'}
        </Button>
        {settings.unlockPinHash && (
          <Button variant="danger" disabled={busy} onClick={removeCode}>
            Remove lock screen
          </Button>
        )}
        {status && (
          <span
            className={`text-xs ${
              status.includes('updated') ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
            }`}
          >
            {status}
          </span>
        )}
      </div>

      <p className="mt-4 text-xs text-[var(--color-muted)]">
        This is a lock screen, not a password. Your data is protected by the account
        sign-in and row-level security; the code just saves you typing an email and
        password every time. Only its hash is stored, never the code itself.
      </p>
    </Card>
  )
}
