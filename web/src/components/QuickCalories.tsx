import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { Button, inputClass } from './ui'
import * as api from '../lib/api'
import { nutritionPayload } from '../lib/mappers'
import { todayIso } from './cards'

/**
 * One-field calorie entry, inline on the dashboard.
 *
 * MyFitnessPal cannot be automated: its login form is protected by a Cloudflare
 * Turnstile bot check that fails for any automated browser regardless of who is
 * typing, and defeating a bot check is not something this project does. Typing
 * one number is therefore the daily nutrition path, not a fallback, so it is
 * built to cost about ten seconds: no navigation, no tab switch, one field.
 *
 * Calories are the only nutrition figure the mission arithmetic uses. Macros
 * are tracked for interest and live on the Check-In page; asking for them here
 * would make the common case slower for no gain.
 */
export function QuickCalories() {
  const { refresh, settings } = useData()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = Number(value.trim())
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && parsed < 20000

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      await api.upsertDailyPatch(
        todayIso(),
        nutritionPayload({
          calories: parsed,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sugar: null,
        }),
      )
      await refresh()
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const adjusted = valid ? Math.round(parsed * settings.intakeAdjustmentFactor) : null

  return (
    <form onSubmit={submit} className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-warn-edge)] bg-[var(--color-warn-quiet)] p-3">
      <label htmlFor="quick-calories" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warn)]">
        Log today's calories
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="quick-calories"
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="2,000"
          aria-describedby="quick-calories-hint"
          className={`${inputClass} text-xl font-semibold`}
        />
        <Button type="submit" disabled={!valid || busy} className="shrink-0">
          {busy ? 'Saving' : 'Save'}
        </Button>
      </div>
      <p id="quick-calories-hint" className="mt-2 text-xs text-[var(--color-muted)]">
        {error ? (
          <span className="text-[var(--color-danger)]">{error}</span>
        ) : adjusted !== null ? (
          <>
            Counts as {adjusted.toLocaleString('en-US')} kcal after the x
            {settings.intakeAdjustmentFactor.toFixed(2)} adjustment.
          </>
        ) : (
          <>
            The one number the mission needs. Macros are optional on{' '}
            <Link to="/check-in" className="underline underline-offset-2">
              Check-In
            </Link>
            .
          </>
        )}
      </p>
    </form>
  )
}
