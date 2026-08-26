import type { ReactNode } from 'react'

/**
 * Shared visual primitives.
 *
 * The radius scale steps down as you nest: hero 24, card 18, control 12, inner
 * 10, chips pill. A single radius everywhere is what makes an interface read as
 * a stack of identical rectangles rather than something with structure.
 *
 * Elevation carries the same job. Cards are not all the same weight: `quiet`
 * has no shadow at all and exists purely to group, `raised` is the default, and
 * `hero` is reserved for the one number the app exists to show. If everything
 * is elevated then nothing is, so the tone is a deliberate choice per card.
 */

export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
  accent = false,
  tone = 'raised',
  interactive = false,
}: {
  title?: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  accent?: boolean
  tone?: 'quiet' | 'raised' | 'hero'
  interactive?: boolean
}) {
  // The lit top edge goes inside the shadow declaration so both live on the same
  // box-shadow property without one clobbering the other.
  const shape = {
    quiet: 'rounded-[var(--radius-card)] bg-[var(--color-card)] p-4 sm:p-5',
    raised:
      'rounded-[var(--radius-card)] bg-[var(--color-card)] p-4 sm:p-5 ' +
      '[box-shadow:var(--shadow-raised),inset_0_1px_0_var(--edge-highlight)]',
    hero:
      'rounded-[var(--radius-hero)] bg-[var(--color-card)] p-5 sm:p-7 ' +
      '[box-shadow:var(--shadow-hero),inset_0_1px_0_var(--edge-highlight)]',
  }[tone]

  return (
    <section
      className={`border ${shape} ${
        accent ? 'border-[var(--color-accent-dim)]' : 'border-[var(--color-edge)]'
      } ${interactive ? 'card-hover' : ''} ${className}`}
    >
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Sentence case at a legible size. Small-caps is a data-label
                treatment, and using it for headings too is what turned a screen
                of readable sections into a screen of shouting. */}
            {title && (
              <h2 className="text-sm font-semibold tracking-[-0.006em] text-[var(--color-text)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-muted)]">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  size = 'md',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'bad' | 'muted'
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  // Contrast thresholds scale with type size, so the tone does too: display
  // figures take the vivid colour, anything set small takes the 7:1 variant.
  const large = size === 'lg' || size === 'xl' || size === 'md'
  const toneClass = {
    default: 'text-[var(--color-text)]',
    good: large ? 'text-[var(--color-accent)]' : 'text-[var(--color-accent-text)]',
    bad: large ? 'text-[var(--color-danger)]' : 'text-[var(--color-danger-text)]',
    muted: 'text-[var(--color-muted)]',
  }[tone]

  // Tracking tightens as the type grows. The spacing that keeps an 18px figure
  // legible reads as slack at 72px.
  const sizeClass = {
    sm: 'text-lg tracking-[-0.01em]',
    md: 'text-2xl tracking-[-0.02em]',
    lg: 'text-4xl tracking-[-0.03em]',
    xl: 'text-6xl tracking-[-0.038em] sm:text-7xl',
  }[size]

  return (
    <div className="min-w-0">
      <div className="eyebrow text-[var(--color-muted)]">{label}</div>
      <div className={`tnum mt-1.5 font-bold leading-[0.95] ${sizeClass} ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1.5 text-xs leading-snug text-[var(--color-muted)]">{hint}</div>}
    </div>
  )
}

/**
 * A track with a fill, and one deliberate lie.
 *
 * At 0.2% of an 84,000 kcal mission a truthful bar is a fraction of a pixel and
 * renders as an empty trough, which reads as "nothing is happening" when in
 * fact something is. Any non-zero value therefore draws at least a visible
 * sliver. The exact figure is stated in text beside every bar in the app and in
 * aria-valuenow, so the rounding is presentational and never the only source of
 * the number.
 */
export function ProgressBar({
  percent,
  tone = 'accent',
  height = 'h-3',
}: {
  percent: number
  tone?: 'accent' | 'warn' | 'danger'
  height?: string
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  // 2.5% rather than a hairline: on a full-width track a smaller minimum is
  // narrower than the bar is tall, and a fully rounded fill that narrow renders
  // as a dot, which reads as a marker rather than as progress.
  const drawn = clamped > 0 ? Math.max(clamped, 2.5) : 0
  const bg = {
    accent: 'bg-[var(--color-accent)]',
    warn: 'bg-[var(--color-warn)]',
    danger: 'bg-[var(--color-danger)]',
  }[tone]

  return (
    <div
      // An inset shadow makes the track read as a channel cut into the surface
      // rather than a grey pill lying on top of it.
      className={`w-full overflow-hidden rounded-full bg-[var(--color-inset)]
        shadow-[inset_0_1px_2px_rgb(2_6_16/0.18)] ring-1 ring-inset ring-[var(--color-edge)] ${height}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700
          ease-[cubic-bezier(0.32,0.72,0,1)] ${bg}`}
        style={{ width: `${drawn}%` }}
      />
    </div>
  )
}

/**
 * The raw -> factor -> adjusted chain, rendered explicitly.
 *
 * This component exists because the whole model rests on two assumptions, and
 * a dashboard that shows only the adjusted number quietly launders them into
 * facts.
 */
export function AdjustmentChain({
  label,
  raw,
  factor,
  adjusted,
  unit = 'kcal',
}: {
  label: string
  raw: number | null
  factor: number
  adjusted: number | null
  unit?: string
}) {
  const fmt = (n: number | null) => (n === null ? '--' : Math.round(n).toLocaleString('en-US'))
  return (
    <div className="rounded-[var(--radius-control)] bg-[var(--color-inset)] p-3.5
      ring-1 ring-inset ring-[var(--color-edge)]">
      <div className="eyebrow text-[var(--color-muted)]">{label}</div>
      <div className="tnum mt-2 flex items-baseline gap-2 text-sm">
        <span className="text-[var(--color-muted)]">Reported</span>
        <span className="font-semibold">{fmt(raw)}</span>
      </div>
      <div className="tnum mt-1 flex items-baseline gap-2 text-sm">
        <span className="text-[var(--color-muted)]">Adjustment</span>
        <span className="font-semibold text-[var(--color-warn-text)]">x {factor.toFixed(2)}</span>
      </div>
      <div className="mt-2.5 border-t border-[var(--color-edge)] pt-2.5">
        <div className="tnum flex items-baseline gap-2">
          <span className="text-xs text-[var(--color-muted)]">Adjusted</span>
          <span className="text-xl font-bold tracking-[-0.02em]">{fmt(adjusted)}</span>
          <span className="text-xs text-[var(--color-muted)]">{unit}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Labels a number's provenance so raw and derived are never confused.
 *
 * A dot plus a word rather than an outlined chip. These sit in the corner of
 * nearly every card, and as bordered badges they read as a row of buttons
 * competing with the data they annotate. The colour still carries the meaning;
 * it just stops shouting it.
 */
export function Tag({ kind }: { kind: 'raw' | 'adjusted' | 'estimated' | 'derived' | 'demo' }) {
  const dot = {
    raw: 'bg-[var(--color-info)]',
    adjusted: 'bg-[var(--color-warn)]',
    estimated: 'bg-[var(--color-estimate)]',
    derived: 'bg-[var(--color-accent)]',
    demo: 'bg-[var(--color-danger)]',
  }[kind]
  const text = {
    raw: 'text-[var(--color-info-text)]',
    adjusted: 'text-[var(--color-warn-text)]',
    estimated: 'text-[var(--color-estimate-text)]',
    derived: 'text-[var(--color-accent-text)]',
    demo: 'text-[var(--color-danger-text)]',
  }[kind]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {kind}
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary:
      'bg-[var(--color-accent-fill)] text-[var(--color-on-accent)] shadow-[var(--shadow-raised)] ' +
      'hover:brightness-110 active:brightness-95 active:shadow-none',
    ghost:
      'border border-[var(--color-edge)] bg-[var(--color-card)] text-[var(--color-text)] ' +
      'hover:border-[var(--color-faint)] hover:bg-[var(--color-inset)]',
    danger:
      'border border-[var(--color-danger-edge)] text-[var(--color-danger-text)] hover:bg-[var(--color-danger-quiet)]',
  }[variant]

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // 44px min height keeps every control inside the touch-target guidance.
      // active:scale gives the press a physical response instead of an instant flip.
      className={`min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-semibold transition
        duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97]
        disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100
        ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Label above, control, then hint or error below.
 *
 * The label is always a real label, never a placeholder standing in for one:
 * placeholder-as-label disappears the moment someone starts typing, which is
 * exactly when they need it. An error replaces the hint rather than stacking
 * beneath it, so the control never shifts position as validation fires.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="eyebrow text-[var(--color-muted)]">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-[var(--color-danger-text)]">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span>
      )}
    </label>
  )
}

export const inputClass =
  'w-full min-h-11 rounded-[var(--radius-control)] border border-[var(--color-edge)] ' +
  'bg-[var(--color-inset)] px-3.5 text-base text-[var(--color-text)] outline-none ' +
  'shadow-[inset_0_1px_2px_rgb(2_6_16/0.06)] transition duration-200 ' +
  'ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--color-faint)] ' +
  'focus:border-[var(--color-accent)] placeholder:text-[var(--color-placeholder)]'

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-[var(--color-inset)] px-6 py-8 text-center
      ring-1 ring-inset ring-[var(--color-edge)]">
      <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-xs leading-relaxed text-[var(--color-muted)]">
        {body}
      </p>
    </div>
  )
}
