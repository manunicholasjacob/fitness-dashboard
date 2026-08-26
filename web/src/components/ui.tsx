import type { ReactNode } from 'react'

/**
 * Shared visual primitives.
 *
 * Radius scale is fixed and applied everywhere: cards use --radius-card (16px),
 * controls use --radius-control (12px), and chips are full pills. Mixing radii
 * ad hoc is what makes an interface look assembled rather than designed.
 */

export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
  accent = false,
}: {
  title?: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  accent?: boolean
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border bg-[var(--color-card)] p-4 sm:p-5 ${
        accent ? 'border-[var(--color-accent-dim)]' : 'border-[var(--color-edge)]'
      } ${className}`}
    >
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-xs text-[var(--color-muted)]">{subtitle}</p>}
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
  const toneClass = {
    default: 'text-[var(--color-text)]',
    good: 'text-[var(--color-accent)]',
    bad: 'text-[var(--color-danger)]',
    muted: 'text-[var(--color-muted)]',
  }[tone]

  const sizeClass = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl sm:text-7xl',
  }[size]

  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className={`tnum mt-1 font-semibold leading-none ${sizeClass} ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-[var(--color-muted)]">{hint}</div>}
    </div>
  )
}

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
  const bg = {
    accent: 'bg-[var(--color-accent)]',
    warn: 'bg-[var(--color-warn)]',
    danger: 'bg-[var(--color-danger)]',
  }[tone]

  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-[var(--color-edge)] ${height}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-[width] duration-700 ${bg}`} style={{ width: `${clamped}%` }} />
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
    <div className="rounded-[var(--radius-control)] border border-[var(--color-edge)] bg-[var(--color-inset)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="tnum mt-2 flex items-baseline gap-2 text-sm">
        <span className="text-[var(--color-muted)]">Reported</span>
        <span className="font-semibold">{fmt(raw)}</span>
      </div>
      <div className="tnum mt-1 flex items-baseline gap-2 text-sm">
        <span className="text-[var(--color-muted)]">Adjustment</span>
        <span className="font-semibold text-[var(--color-warn)]">x {factor.toFixed(2)}</span>
      </div>
      <div className="mt-2 border-t border-[var(--color-edge)] pt-2">
        <div className="tnum flex items-baseline gap-2">
          <span className="text-xs text-[var(--color-muted)]">Adjusted</span>
          <span className="text-xl font-semibold">{fmt(adjusted)}</span>
          <span className="text-xs text-[var(--color-muted)]">{unit}</span>
        </div>
      </div>
    </div>
  )
}

/** Labels a number's provenance so raw and derived are never confused. */
export function Tag({ kind }: { kind: 'raw' | 'adjusted' | 'estimated' | 'derived' | 'demo' }) {
  const styles = {
    raw: 'border-[var(--color-info-edge)] text-[var(--color-info)]',
    adjusted: 'border-[var(--color-warn-edge)] text-[var(--color-warn)]',
    estimated: 'border-[var(--color-estimate-edge)] text-[var(--color-estimate)]',
    derived: 'border-[var(--color-accent-dim)] text-[var(--color-accent)]',
    demo: 'border-[var(--color-danger-edge)] text-[var(--color-danger)]',
  }[kind]
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${styles}`}
    >
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
    primary: 'bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:brightness-110',
    ghost:
      'border border-[var(--color-edge)] text-[var(--color-text)] hover:bg-[var(--color-inset)]',
    danger:
      'border border-[var(--color-danger-edge)] text-[var(--color-danger)] hover:bg-[var(--color-danger-quiet)]',
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-[var(--color-danger)]">
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
  'bg-[var(--color-inset)] px-3 text-base text-[var(--color-text)] outline-none transition ' +
  'focus:border-[var(--color-accent)] placeholder:text-[var(--color-placeholder)]'

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-edge)] p-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{body}</p>
    </div>
  )
}
