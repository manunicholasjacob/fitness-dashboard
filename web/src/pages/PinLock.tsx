import { useCallback, useEffect, useState, type ReactNode } from 'react'
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
    <div className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
      {/* The same ambient wash the mission card uses, so the app's front door
          and its centrepiece are lit the same way. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 h-[36rem] -translate-y-1/2
          bg-[radial-gradient(44%_46%_at_50%_50%,var(--hero-glow),var(--hero-glow-mid)_55%,transparent_78%)]"
      />

      <div className="flex w-full max-w-[19rem] flex-col items-center">
        <h1 className="flex items-center gap-2.5 text-center text-lg font-bold
          tracking-[0.22em] text-[var(--color-accent)]">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[var(--color-accent)]
              shadow-[0_0_0_4px_var(--color-accent-quiet)]"
          />
          MANU FITNESS
        </h1>
        <p className="mt-3 text-center text-sm text-[var(--color-muted)]">
          {busy ? 'Checking' : 'Enter your code'}
        </p>

        <div
          className={`mt-7 flex gap-3.5 ${error ? 'animate-[shake_0.5s]' : ''}`}
          role="status"
          aria-live="polite"
          aria-label={error ?? `${digits.length} of ${length} digits entered`}
        >
          {Array.from({ length }, (_, i) => (
            <span
              key={i}
              // Filled dots grow very slightly, so entry registers as motion in
              // the corner of the eye and not only as a colour change.
              className={`h-3.5 w-3.5 rounded-full transition duration-200
                ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  error
                    ? 'scale-100 bg-[var(--color-danger)]'
                    : i < digits.length
                      ? 'scale-110 bg-[var(--color-accent)]'
                      // --color-edge is a border tone and lands at 1.11:1 on
                      // the page, which is invisible. These dots are the only
                      // indication of how much of the code has been entered.
                      : 'scale-100 bg-[var(--color-faint)]'
                }`}
            />
          ))}
        </div>

        {/* Reserved height, so the keypad never jumps when an error appears. */}
        <p className="mt-3 flex min-h-9 items-center px-2 text-center text-xs
          text-[var(--color-danger-text)]">
          {error ?? ''}
        </p>

        {/*
         * The keypad is one object rather than twelve loose buttons: an outer
         * tray with a hairline and an inner grid, the way a physical keypad has
         * a bezel. Concentric radii, so the corners of the keys echo the corner
         * of the tray instead of fighting it.
         */}
        <div className="w-full rounded-[1.75rem] bg-[var(--color-card)] p-3
          ring-1 ring-[var(--color-edge)]
          [box-shadow:var(--shadow-hero),inset_0_1px_0_var(--edge-highlight)]">
          <div className="grid grid-cols-3 gap-2.5">
            {keys.map((k) => (
              <KeypadButton key={k} label={k} onPress={() => push(k)} disabled={busy} />
            ))}
            <span />
            <KeypadButton label="0" onPress={() => push('0')} disabled={busy} />
            <KeypadButton
              icon={<BackspaceIcon />}
              onPress={back}
              ariaLabel="Delete last digit"
              disabled={busy}
              muted
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Backspace, drawn rather than borrowed.
 *
 * This was U+232B, the Unicode erase-to-the-left glyph. A text glyph standing
 * in for an icon inherits the font's weight and metrics instead of the icon
 * set's, so it sat heavier than every other stroke in the app and shifted with
 * the typeface. Same 1.5 stroke as the navigation icons.
 */
function BackspaceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M20 6H9.5a2 2 0 0 0-1.5.68l-4.2 4.7a1 1 0 0 0 0 1.34l4.2 4.7A2 2 0 0 0 9.5 18H20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
      <path d="M17 9.5 12.5 14M12.5 9.5 17 14" />
    </svg>
  )
}

function KeypadButton({
  label,
  icon,
  onPress,
  ariaLabel,
  disabled = false,
  muted = false,
}: {
  label?: string
  icon?: ReactNode
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
      // 3.75rem is well past the 44px touch-target guidance, which matters more
      // here than anywhere else: this is the first thing a thumb touches, every
      // single time the app opens.
      //
      // Round, because that is what a passcode key is everywhere a passcode is
      // entered, and because a circle inside a squircle tray reads as a keypad
      // where a grid of small squares reads as a table.
      // aspect-square rather than a fixed height: the grid column is wider than
      // any height that suits the type, and rounded-full on a non-square box
      // gives an ellipse, not a key.
      className={`tnum flex aspect-square w-full items-center justify-center rounded-full
        bg-[var(--color-inset)] text-2xl font-semibold
        ring-1 ring-inset ring-[var(--color-edge)]
        transition duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
        hover:bg-[var(--color-card-raised)] hover:ring-[var(--color-faint)]
        active:scale-[0.92] active:bg-[var(--color-accent-quiet)]
        disabled:opacity-40 disabled:active:scale-100
        ${muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'}`}
    >
      {icon ?? label}
    </button>
  )
}
