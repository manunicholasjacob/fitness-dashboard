import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { pluralize } from '../core/units'

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

/**
 * A sync in progress, said quietly.
 *
 * The word "Syncing" in the corner is easy to miss and slightly shouty in caps.
 * A pulsing dot beside it is read peripherally, which is the right amount of
 * attention for something that happens four times a day and needs no action.
 */
function SyncingPulse() {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full
          bg-[var(--color-accent)] opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      </span>
      Syncing
    </span>
  )
}

function Icon({ path }: { path: string }) {
  return (
    /* 1.5 rather than 2: at 20px a two-pixel stroke reads as heavy and slightly
       crude, and these sit beside 11px labels far lighter than that. */
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden="true">
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
    if (since !== null && since >= 2) warnings.push(`${label} has not synced in ${pluralize(since, 'day')}.`)
  }

  // Only nag about a missing log once there is data to be missing from.
  if (warnings.length === 0 && daily.length > 0 && syncLogs.length === 0) return null
  if (warnings.length === 0) return null

  return (
    <div className="border-b border-[var(--color-warn-edge)] bg-[var(--color-warn)]/10 px-4 py-2 text-center text-xs text-[var(--color-warn-text)]">
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
    <div className="border-b border-[var(--color-danger-edge)] bg-[var(--color-danger)]/10 px-4 py-2 text-center text-xs text-[var(--color-danger-text)]">
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
          focus:rounded-[var(--radius-control)] focus:bg-[var(--color-accent-fill)]
          focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-on-accent)]"
      >
        Skip to content
      </a>
      <DemoBanner />
      <StaleBanner />

      {/* Desktop / tablet navigation */}
      {/*
       * A floating island rather than a bar welded to the top edge.
       *
       * An edge-to-edge bar reads as browser chrome; detaching it and letting
       * the page scroll underneath makes it read as part of the app. The outer
       * shell and inner core are separate layers so the pill has a real edge
       * rather than a drawn-on border: hairline ring outside, highlight inside.
       */}
      <div className="sticky top-0 z-20 hidden px-6 pb-2 pt-4 md:block">
        <header
          // w-max, so the pill is the width of what is in it. Stretched to a
          // container width it stops reading as an object and goes back to
          // reading as a bar with rounded ends.
          className="material mx-auto flex w-max max-w-full items-center gap-1 rounded-full
            bg-[var(--color-surface)]/75 px-2.5 py-2 ring-1 ring-[var(--color-edge)]
            backdrop-blur-xl
            [box-shadow:var(--shadow-raised),inset_0_1px_0_var(--edge-highlight)]"
        >
          <span className="ml-2 mr-4 flex items-center gap-2 text-[13px] font-bold
            tracking-[0.16em] text-[var(--color-accent-text)]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]
                shadow-[0_0_0_3px_var(--color-accent-quiet)]"
            />
            MISSION
          </span>
          {[...NAV, ...MORE].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-[13px] transition duration-300
                 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                   isActive
                     ? 'bg-[var(--color-accent-quiet)] font-semibold text-[var(--color-accent-text)] ' +
                       'ring-1 ring-inset ring-[var(--color-accent-dim)]'
                     : 'font-medium text-[var(--color-muted)] hover:bg-[var(--color-inset)] ' +
                       'hover:text-[var(--color-text)]'
                 }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {/* A hairline divider, so the account controls read as a separate
              group rather than as two more nav destinations. */}
          <span aria-hidden="true" className="mx-2 h-4 w-px bg-[var(--color-edge)]" />
          <div className="flex items-center gap-2 pr-1.5">
            {refreshing && <SyncingPulse />}
            <span className="text-xs text-[var(--color-muted)]">{settings.displayName}</span>
            <button
              onClick={() => void signOut()}
              className="rounded-full px-2.5 py-1 text-xs text-[var(--color-muted)] transition
                duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--color-inset)]
                hover:text-[var(--color-text)] active:scale-[0.97]"
            >
              Sign out
            </button>
          </div>
        </header>
      </div>

      {/* Mobile header keeps the identity without stealing vertical space. */}
      <header className="material sticky top-0 z-20 flex items-center justify-between
        bg-[var(--color-ink)]/80 px-4 py-3 backdrop-blur-xl md:hidden">
        <span className="flex items-center gap-2 text-xs font-bold tracking-[0.18em]
          text-[var(--color-accent-text)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]
              shadow-[0_0_0_3px_var(--color-accent-quiet)]"
          />
          MISSION
        </span>
        {refreshing && <SyncingPulse />}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-14 md:pt-7">
        <Outlet />
      </main>

      {/*
       * Mobile bottom navigation: thumb-reachable, safe-area aware, and a
       * floating island rather than a bar welded to the bottom edge, to match
       * the desktop nav.
       *
       * Detaching it costs a little width and buys two things: the page scrolls
       * visibly underneath rather than being clipped by it, and on a phone with
       * a home indicator the bar no longer fights the system gesture area for
       * the same strip of glass.
       */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 z-30 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.625rem)' }}
      >
        <div
          className="material flex rounded-[1.375rem] bg-[var(--color-surface)]/85 p-1
            ring-1 ring-[var(--color-edge)] backdrop-blur-xl
            [box-shadow:var(--shadow-hero),inset_0_1px_0_var(--edge-highlight)]"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-1 rounded-[1rem] py-2
                 text-[11px] transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
                 active:scale-[0.94] ${
                   isActive
                     ? 'bg-[var(--color-accent-quiet)] font-semibold text-[var(--color-accent-text)]'
                     : 'font-medium text-[var(--color-muted)]'
                 }`
              }
            >
              <Icon path={item.icon} />
              {item.short}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={`relative flex flex-1 flex-col items-center gap-1 rounded-[1rem] py-2
              text-[11px] transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
              active:scale-[0.94] ${
                onMore
                  ? 'bg-[var(--color-accent-quiet)] font-semibold text-[var(--color-accent-text)]'
                  : 'font-medium text-[var(--color-muted)]'
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
