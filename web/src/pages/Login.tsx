import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { Button, inputClass } from '../components/ui'

export function Login() {
  const { signIn, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-[0.2em] text-[var(--color-accent)]">
          MANU FITNESS
        </h1>
        <p className="mt-2 text-center text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Energy Deficit Mission Control
        </p>

        {!configured ? (
          <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-warn-edge)] bg-[var(--color-warn)]/10 p-4 text-sm text-[var(--color-warn)]">
            <p className="font-semibold">Supabase is not configured.</p>
            <p className="mt-2 text-xs leading-relaxed">
              Copy <code className="font-mono">.env.example</code> to{' '}
              <code className="font-mono">.env</code> in <code className="font-mono">web/</code>, fill in
              your project URL and anon key, then restart the dev server. Full steps are in{' '}
              <code className="font-mono">docs/SETUP.md</code>.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={`${inputClass} mt-1.5`}
              />
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--color-danger-edge)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in...' : 'Sign In'}
            </Button>

            <p className="text-center text-[11px] text-[var(--color-muted)]">
              This device stays signed in, so you should only do this once.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
