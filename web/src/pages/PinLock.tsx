import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MAX_CODE_LENGTH, MIN_CODE_LENGTH, markUnlocked, redeemCode } from '../lib/pin'

/**
 * The only way into the app.
 *
 * Built for a thumb: an on-screen keypad with large targets, because on a phone
 * the system keyboard would cover half the screen for a handful of digits. A
 * physical keyboard works too, so it is equally usable on a laptop.
 *
 * Code length is not fixed. It submits at the configured length automatically,
 * and a longer code can be entered and confirmed. Four digits is 10,000
 * combinations; six is a million, for the same two extra taps.
 */
export function PinLock({
  codeLength,
  onUnlocked,
}: {
  codeLength: number
  onUnlocked: () => void
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const length = Math.min(Math.max(codeLength, MIN_CODE_LENGTH), MAX_CODE_LENGTH)

  const submit = useCallback(
    async (code: string) => {
      setBusy(true)
      setError(null)
      const result = await redeemCode(code)

      if (!result.ok || !result.session) {
        setBusy(false)
        setDigits('')
        setError(result.error ?? 'Incorrect code.')
        return
      }

      // Hand the session to supabase-js so every later request is authenticated
      // and refreshes itself.
      const client = supabase
      if (!client) {
        setBusy(false)
        setError('The app is not configured.')
        return
      }
      const { error: sessionError } = await client.auth.setSession(result.session)
      setBusy(false)

      if (sessionError) {
        setDigits('')
        setError(sessionError.message)
        return
      }
      markUnlocked()
      onUnlocked()
    },
    [onUnlocked],
  )

  const push = useCallback(
    (d: string) => {
      setDigits((current) => {
        if (busy || current.length >= length) return current
        const next = current + d
        if (next.length === length) void submit(next)
        return next
      })
    },
    [busy, length, submit],
  )

  const back = useCallback(() => {
    setError(null)
    setDigits((c) => c.slice(0, -1))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') push(e.key)
      else if (e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [push, back])

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <h1 className="text-center text-xl font-bold tracking-[0.24em] text-[var(--color-accent)]">
        MANU FITNESS
      </h1>
      <p className="mt-2.5 text-center text-sm text-[var(--color-muted)]">
        {busy ? 'Checking' : 'Enter your code'}
      </p>

      <div
        className={`mt-8 flex gap-4 ${error ? 'animate-[shake_0.5s]' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={error ?? `${digits.length} of ${length} digits entered`}
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition ${
              error
                ? 'border-[var(--color-danger)] bg-[var(--color-danger)]'
                : i < digits.length
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                  : 'border-[var(--color-edge)]'
            }`}
          />
        ))}
      </div>

      <p className="mt-4 min-h-10 max-w-[18rem] text-center text-xs text-[var(--color-danger-text)]">
        {error ?? ''}
      </p>

      <div className="grid w-full max-w-[17rem] grid-cols-3 gap-3">
        {keys.map((k) => (
          <KeypadButton key={k} label={k} onPress={() => push(k)} disabled={busy} />
        ))}
        <span />
        <KeypadButton label="0" onPress={() => push('0')} disabled={busy} />
        <KeypadButton
          label="&#9003;"
          onPress={back}
          ariaLabel="Delete last digit"
          disabled={busy}
          muted
        />
      </div>
    </div>
  )
}

function KeypadButton({
  label,
  onPress,
  ariaLabel,
  disabled = false,
  muted = false,
}: {
  label: string
  onPress: () => void
  ariaLabel?: string
  disabled?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      // 4rem is well past the 44px touch-target guidance, which matters more
      // here than anywhere else: this is the first thing a thumb touches, every
      // single time the app opens.
      className={`tnum h-16 rounded-[var(--radius-control)] border border-[var(--color-edge)] text-2xl font-semibold
        transition duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.94]
        disabled:opacity-40 disabled:active:scale-100
        ${muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'}
        bg-[var(--color-card)] hover:bg-[var(--color-inset)]`}
    >
      {label === '&#9003;' ? '⌫' : label}
    </button>
  )
}
