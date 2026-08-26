import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z' },
  { to: '/mission', label: 'Mission', short: 'Mission', icon: 'M12 2v20M2 12h20M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z' },
  { to: '/activity', label: 'Activity', short: 'Activity', icon: 'M3 12h4l3 8 4-16 3 8h4' },
  { to: '/check-in', label: 'Check-In', short: 'Log', icon: 'M12 5v14M5 12h14' },
  { to: '/analytics', label: 'Analytics', short: 'Charts', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
]

const MORE = [
  { to: '/integrations', label: 'Integrations' },
  { to: '/settings', label: 'Settings' },
  { to: '/display', label: 'Display Mode' },
]

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

/** Warns when a sync has gone quiet, so silent failure never masquerades as a rest day. */
function StaleBanner() {
  const { syncLogs, daily } = useData()

  const lastSuccess = (provider: 'garmin' | 'mfp') =>
    syncLogs.find((l) => l.provider === provider && l.status === 'success')?.completedAt ?? null

  const daysSince = (iso: string | null) => {
    if (!iso) return null
    return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  }

  const warnings: string[] = []
  for (const [provider, label] of [['garmin', 'Garmin'], ['mfp', 'MyFitnessPal']] as const) {
    const since = daysSince(lastSuccess(provider))
    if (since !== null && since >= 2) warnings.push(`${label} has not synced in ${since} days.`)
  }

  // Only nag about a missing log once there is data to be missing from.
  if (warnings.length === 0 && daily.length > 0 && syncLogs.length === 0) return null
  if (warnings.length === 0) return null

  return (
    <div className="border-b border-[var(--color-warn-edge)] bg-[var(--color-warn)]/10 px-4 py-2 text-center text-xs text-[var(--color-warn)]">
      {warnings.join(' ')}{' '}
      <NavLink to="/integrations" className="underline underline-offset-2">
        Check integrations
      </NavLink>
    </div>
  )
}

function DemoBanner() {
  const { daily, body, activities } = useData()
  const hasDemo =
    daily.some((d) => d.isDemo) ||
    body.some((b) => b.source === 'demo') ||
    activities.some((a) => a.externalSource === 'demo')
  if (!hasDemo) return null

  return (
    <div className="border-b border-[var(--color-danger-edge)] bg-[var(--color-danger)]/10 px-4 py-2 text-center text-xs text-[var(--color-danger)]">
      Demo data is loaded. These numbers are generated, not measured.{' '}
      <NavLink to="/settings" className="underline underline-offset-2">
        Remove it
      </NavLink>
    </div>
  )
}

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/mission': 'Mission',
  '/activity': 'Activity',
  '/analytics': 'Analytics',
  '/check-in': 'Check-In',
  '/integrations': 'Integrations',
  '/settings': 'Settings',
}

export function Layout() {
  const { settings, refreshing } = useData()
  const { signOut } = useAuth()
  const location = useLocation()
  const onMore = MORE.some((m) => m.to === location.pathname)

  // A screen reader announces the document title on navigation, and a static
  // title makes every route sound identical.
  useEffect(() => {
    const page = TITLES[location.pathname] ?? 'Dashboard'
    document.title = `${page} | Energy Deficit Mission`
  }, [location.pathname])

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-ink)]">
      {/* Keyboard users should not have to tab through the whole nav to reach
          the numbers they came for. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
          focus:rounded-[var(--radius-control)] focus:bg-[var(--color-accent)]
          focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-on-accent)]"
      >
        Skip to content
      </a>
      <DemoBanner />
      <StaleBanner />

      {/* Desktop / tablet navigation */}
      <header className="sticky top-0 z-20 hidden border-b border-[var(--color-edge)] material bg-[var(--color-ink)]/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-3">
          <span className="mr-4 text-sm font-bold tracking-[0.16em] text-[var(--color-accent)]">
            MISSION
          </span>
          {[...NAV, ...MORE].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/10 text-[var(--color-text)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <div className="ml-auto flex items-center gap-3">
            {refreshing && (
              <span className="text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
                Syncing
              </span>
            )}
            <span className="text-xs text-[var(--color-muted)]">{settings.displayName}</span>
            <button
              onClick={() => void signOut()}
              className="text-xs text-[var(--color-muted)] underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile header keeps the identity without stealing vertical space. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-edge)] bg-[var(--color-ink)]/90 px-4 py-3 backdrop-blur md:hidden">
        <span className="text-xs font-bold tracking-[0.18em] text-[var(--color-accent)]">MISSION</span>
        {refreshing && (
          <span className="text-[11px] uppercase tracking-widest text-[var(--color-muted)]">Syncing</span>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom navigation, thumb-reachable and safe-area aware. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-edge)] material bg-[var(--color-surface)]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
                }`
              }
            >
              <Icon path={item.icon} />
              {item.short}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
              onMore ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
            }`}
          >
            <Icon path="M4 6h16M4 12h16M4 18h16" />
            More
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
