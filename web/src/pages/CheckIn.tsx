import { useMemo, useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import { Button, Card, Field, Stat, Tag, inputClass } from '../components/ui'
import { todayIso } from '../components/cards'
import * as api from '../lib/api'
import { nutritionPayload } from '../lib/mappers'
import { bodyComposition, latestMeasurement } from '../core/body'
import { cmToIn, inToCm, kgToLb, lbToKg } from '../core/units'

/** Parse a form field into a number, treating blank as "not measured". */
function parseOptional(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * Validate as the value is typed rather than on submit.
 *
 * Bounds are deliberately wide: this catches a fat-fingered 1634 for 163.4, not
 * a body that does not match an expectation. Blank is always valid, because
 * every field on this form is optional.
 */
function rangeError(raw: string, min: number, max: number, unit: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return 'Numbers only.'
  if (n < min || n > max) return `Expected between ${min} and ${max} ${unit}.`
  return null
}

export function CheckIn() {
  const { body, settings, refresh } = useData()

  const weightUnit = settings.units === 'imperial' ? 'lb' : 'kg'
  const lengthUnit = settings.lengthUnits === 'imperial' ? 'in' : 'cm'

  const toDisplayWeight = (kg: number) => (settings.units === 'imperial' ? kgToLb(kg) : kg)
  const toStoredWeight = (v: number) => (settings.units === 'imperial' ? lbToKg(v) : v)
  const toDisplayLength = (cm: number) => (settings.lengthUnits === 'imperial' ? cmToIn(cm) : cm)
  const toStoredLength = (v: number) => (settings.lengthUnits === 'imperial' ? inToCm(v) : v)

  const [date, setDate] = useState(todayIso())
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [neck, setNeck] = useState('')
  const [hip, setHip] = useState('')
  const [notes, setNotes] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Nutrition fallback, used on the days MyFitnessPal did not sync.
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [fiber, setFiber] = useState('')
  const [sugar, setSugar] = useState('')
  const [nutritionStatus, setNutritionStatus] = useState<string | null>(null)

  const imperialWeight = settings.units === 'imperial'
  const imperialLength = settings.lengthUnits === 'imperial'
  const weightError = rangeError(weight, imperialWeight ? 50 : 23, imperialWeight ? 700 : 320, weightUnit)
  const waistError = rangeError(waist, imperialLength ? 15 : 38, imperialLength ? 80 : 200, lengthUnit)
  const neckError = rangeError(neck, imperialLength ? 8 : 20, imperialLength ? 30 : 76, lengthUnit)
  const hipError = rangeError(hip, imperialLength ? 20 : 50, imperialLength ? 90 : 230, lengthUnit)
  const hasFieldError = Boolean(weightError || waistError || neckError || hipError)

  const existing = useMemo(() => body.find((b) => b.date === date), [body, date])
  const lastWeight = latestMeasurement(body, 'weightKg')
  const lastWaist = latestMeasurement(body, 'waistCm')
  const lastNeck = latestMeasurement(body, 'neckCm')

  // Live Navy estimate from whatever is on screen right now, falling back to the
  // most recent stored measurement for anything left blank.
  const preview = useMemo(() => {
    const w = parseOptional(weight)
    const wa = parseOptional(waist)
    const n = parseOptional(neck)
    return bodyComposition(
      settings.sex,
      settings.heightCm,
      w !== null ? toStoredWeight(w) : (lastWeight?.value ?? null),
      wa !== null ? toStoredLength(wa) : (lastWaist?.value ?? null),
      n !== null ? toStoredLength(n) : (lastNeck?.value ?? null),
      settings.startingBodyFatPercent,
      parseOptional(hip) !== null ? toStoredLength(parseOptional(hip)!) : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight, waist, neck, hip, settings, lastWeight, lastWaist, lastNeck])

  async function saveBody(e: FormEvent) {
    e.preventDefault()
    if (hasFieldError) return
    const w = parseOptional(weight)
    const wa = parseOptional(waist)
    const n = parseOptional(neck)
    const h = parseOptional(hip)

    if (w === null && wa === null && n === null && h === null && notes.trim() === '') {
      setStatus('Nothing to save.')
      return
    }

    setBusy(true)
    setStatus(null)
    try {
      await api.upsertBodyEntry({
        date,
        weightKg: w !== null ? toStoredWeight(w) : null,
        waistCm: wa !== null ? toStoredLength(wa) : null,
        neckCm: n !== null ? toStoredLength(n) : null,
        hipCm: h !== null ? toStoredLength(h) : null,
        notes: notes.trim() || null,
        source: 'manual',
      })
      await refresh()
      setStatus('Saved.')
      setWeight('')
      setWaist('')
      setNeck('')
      setHip('')
      setNotes('')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function saveNutrition(e: FormEvent) {
    e.preventDefault()
    const cals = parseOptional(calories)
    if (cals === null) {
      setNutritionStatus('Calories are required.')
      return
    }
    setBusy(true)
    setNutritionStatus(null)
    try {
      await api.upsertDailyPatch(
        date,
        nutritionPayload({
          calories: cals,
          protein: parseOptional(protein),
          carbs: parseOptional(carbs),
          fat: parseOptional(fat),
          fiber: parseOptional(fiber),
          sugar: parseOptional(sugar),
        }),
      )
      await refresh()
      setNutritionStatus('Saved.')
      setCalories('')
      setProtein('')
      setCarbs('')
      setFat('')
      setFiber('')
      setSugar('')
    } catch (err) {
      setNutritionStatus(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* The fast path: two numbers and a button. */}
      <Card
        title="Daily Check-In"
        subtitle={existing ? 'An entry already exists for this date and will be updated' : undefined}
        right={
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--color-edge)] bg-[var(--color-inset)] px-2 py-1 text-xs text-[var(--color-text)]"
            aria-label="Check-in date"
          />
        }
      >
        <form onSubmit={saveBody}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Weight (${weightUnit})`} error={weightError}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                // Numeric keypad, autofocus, and a placeholder showing the last
                // reading: the whole point is that this takes one hand.
                autoFocus
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={
                  existing?.weightKg != null
                    ? toDisplayWeight(existing.weightKg).toFixed(1)
                    : lastWeight
                      ? toDisplayWeight(lastWeight.value).toFixed(1)
                      : '170.0'
                }
                className={`${inputClass} text-2xl font-semibold`}
              />
            </Field>

            <Field label={`Waist (${lengthUnit})`} error={waistError}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={waist}
                onChange={(e) => setWaist(e.target.value)}
                placeholder={
                  existing?.waistCm != null
                    ? toDisplayLength(existing.waistCm).toFixed(1)
                    : lastWaist
                      ? toDisplayLength(lastWaist.value).toFixed(1)
                      : '87.0'
                }
                className={`${inputClass} text-2xl font-semibold`}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="mt-3 text-xs font-semibold text-[var(--color-muted)] underline-offset-2 hover:underline"
          >
            {showMore ? 'Hide' : 'Add'} neck, hips and notes
          </button>

          {showMore && (
            <div className="mt-3 space-y-3 rounded-[var(--radius-control)] border border-[var(--color-edge)] bg-[var(--color-inset)] p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Neck (${lengthUnit})`} hint="Only needed occasionally" error={neckError}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={neck}
                    onChange={(e) => setNeck(e.target.value)}
                    placeholder={lastNeck ? toDisplayLength(lastNeck.value).toFixed(1) : '40.0'}
                    className={inputClass}
                  />
                </Field>
                <Field label={`Hips (${lengthUnit})`} hint="Optional" error={hipError}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={hip}
                    onChange={(e) => setHip(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Sleep, hunger, soreness, recovery"
                  className={`${inputClass} py-2`}
                />
              </Field>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={busy || hasFieldError} className="flex-1">
              {busy ? 'Saving...' : hasFieldError ? 'Fix the value above' : 'Save Check-In'}
            </Button>
            {status && (
              <span
                className={`text-xs ${
                  status === 'Saved.' ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'
                }`}
              >
                {status}
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card title="Body Composition" subtitle="Updates live as you type" right={<Tag kind="estimated" />}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Navy BF"
            value={preview.navyBodyFatPercent === null ? '--' : `${preview.navyBodyFatPercent.toFixed(1)}%`}
            size="md"
            hint="From waist, neck, height"
          />
          <Stat label="Planning BF" value={`${preview.planningBodyFatPercent.toFixed(0)}%`} size="md" hint="Your assumption" />
          <Stat
            label="Fat mass"
            value={preview.fatMassKg === null ? '--' : `${toDisplayWeight(preview.fatMassKg).toFixed(1)} ${weightUnit}`}
            size="md"
          />
          <Stat
            label="Lean mass"
            value={preview.leanMassKg === null ? '--' : `${toDisplayWeight(preview.leanMassKg).toFixed(1)} ${weightUnit}`}
            size="md"
          />
        </div>
        {preview.estimateSpread !== null && Math.abs(preview.estimateSpread) > 2 && (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            The Navy estimate differs from your planning figure by{' '}
            {Math.abs(preview.estimateSpread).toFixed(1)} points. The formula carries roughly a
            3-point standard error, so treat it as a second opinion rather than a correction.
          </p>
        )}
      </Card>

      <Card
        title="Nutrition Fallback"
        subtitle="Only needed when the MyFitnessPal sync did not run"
        right={<Tag kind="raw" />}
      >
        <form onSubmit={saveNutrition}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Calories">
              <input type="number" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)}
                placeholder="2000" className={`${inputClass} text-xl font-semibold`} />
            </Field>
            <Field label="Protein (g)">
              <input type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Carbs (g)">
              <input type="number" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Fat (g)">
              <input type="number" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Fiber (g)">
              <input type="number" inputMode="numeric" value={fiber} onChange={(e) => setFiber(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Sugar (g)">
              <input type="number" inputMode="numeric" value={sugar} onChange={(e) => setSugar(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" variant="ghost" disabled={busy}>
              Save Nutrition
            </Button>
            {nutritionStatus && (
              <span
                className={`text-xs ${
                  nutritionStatus === 'Saved.' ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'
                }`}
              >
                {nutritionStatus}
              </span>
            )}
          </div>
        </form>
      </Card>

      <RecentEntries />
    </div>
  )
}

function RecentEntries() {
  const { body, settings, refresh } = useData()
  const recent = body.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14)

  const weightUnit = settings.units === 'imperial' ? 'lb' : 'kg'
  const lengthUnit = settings.lengthUnits === 'imperial' ? 'in' : 'cm'
  const dispW = (kg: number | null) => (kg === null ? '--' : (settings.units === 'imperial' ? kgToLb(kg) : kg).toFixed(1))
  const dispL = (cm: number | null) =>
    cm === null ? '--' : (settings.lengthUnits === 'imperial' ? cmToIn(cm) : cm).toFixed(1)

  if (recent.length === 0) return null

  return (
    <Card title="Recent Check-Ins">
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
              <th className="px-2 pb-2 font-semibold">Date</th>
              <th className="px-2 pb-2 text-right font-semibold">Weight ({weightUnit})</th>
              <th className="px-2 pb-2 text-right font-semibold">Waist ({lengthUnit})</th>
              <th className="px-2 pb-2 text-right font-semibold">Neck ({lengthUnit})</th>
              <th className="px-2 pb-2" />
            </tr>
          </thead>
          <tbody className="tnum">
            {recent.map((e) => (
              <tr key={e.date} className="border-t border-[var(--color-edge)]">
                <td className="px-2 py-2 text-[var(--color-muted)]">
                  {new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-2 py-2 text-right font-semibold">{dispW(e.weightKg)}</td>
                <td className="px-2 py-2 text-right">{dispL(e.waistCm)}</td>
                <td className="px-2 py-2 text-right">{dispL(e.neckCm)}</td>
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={async () => {
                      await api.deleteBodyEntry(e.date)
                      await refresh()
                    }}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                    aria-label={`Delete check-in for ${e.date}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
