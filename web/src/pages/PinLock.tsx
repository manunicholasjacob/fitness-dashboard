import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { PIN_LENGTH, markUnlocked, verifyPin } from '../lib/pin'

/**
 * The lock screen.
 *
 * Built for a thumb: an on-screen keypad with large targets, because on a phone
 * the system keyboard would cover half the screen for four digits. A physical
 * keyboard works too, so it is equally usable on a laptop.
 *
 * It submits automatically on the last digit. Asking someone to type four
 * digits and then reach for a confirm button is a button too many.
 */
export function PinLock({ expectedHash, onUnlock }: { expectedHash: string | null; onUnlock: () => void }) {
  const { signOut } = useAuth()
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  const submit = useCallback(
    async (code: string) => {
      setChecking(true)
      const ok = await verifyPin(code, expectedHash)
      setChecking(false)
      if (ok) {
        markUnlocked()
        onUnlock()
        return
      }
      setError(true)
      setDigits('')
      // Clear the error once the shake has played, so the next attempt is clean.
      window.setTimeout(() => setError(false), 600)
    },
    [expectedHash, onUnlock],
  )

  const push = useCallback(
    (d: string) => {
      setDigits((current) => {
        if (current.length >= PIN_LENGTH || checking) return current
        const next = current + d
        if (next.length === PIN_LENGTH) void submit(next)
        return next
      })
    },
    [checking, submit],
  )

  const back = useCallback(() => setDigits((c) => c.slice(0, -1)), [])

  // Physical keyboard, for the laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') push(e.key)
      else if (e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [push, back])

  // No code configured yet: say so rather than locking the owner out.
  if (!expectedHash) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-[0.2em] text-[var(--color-accent)]">
            MANU FITNESS
          </h1>
          <p className="mt-6 rounded-[var(--radius-control)] border border-[var(--color-warn-edge)] bg-[var(--color-warn-quiet)] p-4 text-sm text-[var(--color-warn)]">
            No unlock code is set for this account. Set one in Settings, or continue
            without a lock screen.
          </p>
          <button
            onClick={() => {
              markUnlocked()
              onUnlock()
            }}
            className="mt-4 min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-accent)]"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <h1 className="text-center text-xl font-bold tracking-[0.24em] text-[var(--color-accent)]">
        MANU FITNESS
      </h1>
      <p className="mt-2 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Enter your code
      </p>

      {/* The filled dots are the only feedback; the digits are never shown. */}
      <div
        className={`mt-8 flex gap-4 ${error ? 'animate-[shake_0.5s]' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={
          error
            ? 'Incorrect code'
            : `${digits.length} of ${PIN_LENGTH} digits entered`
        }
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
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

      <p className="mt-4 h-5 text-xs text-[var(--color-danger)]">
        {error ? 'Incorrect code' : ''}
      </p>

      <div className="mt-4 grid w-full max-w-[17rem] grid-cols-3 gap-3">
        {keys.map((k) => (
          <KeypadButton key={k} label={k} onPress={() => push(k)} />
        ))}
        <span />
        <KeypadButton label="0" onPress={() => push('0')} />
        <KeypadButton label="⌫" onPress={back} ariaLabel="Delete last digit" muted />
      </div>

      <button
        onClick={() => void signOut()}
        className="mt-10 text-xs text-[var(--color-muted)] underline-offset-2 hover:underline"
      >
        Sign out of this device
      </button>
    </div>
  )
}

function KeypadButton({
  label,
  onPress,
  ariaLabel,
  muted = false,
}: {
  label: string
  onPress: () => void
  ariaLabel?: string
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel ?? label}
      // 4rem is comfortably past the 44px touch-target guidance, which matters
      // more here than anywhere else in the app: this is the first thing a
      // thumb touches, every single time.
      className={`tnum h-16 rounded-[var(--radius-control)] border border-[var(--color-edge)] text-2xl font-semibold
        transition duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.94]
        ${muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'}
        bg-[var(--color-card)] hover:bg-[var(--color-inset)]`}
    >
      {label}
    </button>
  )
}
