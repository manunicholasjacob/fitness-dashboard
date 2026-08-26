import { Suspense, lazy, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { DataProvider } from './lib/data'
import { isUnlocked } from './lib/pin'
import { isConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { PinLock } from './pages/PinLock'
import { Dashboard } from './pages/Dashboard'

// Only the dashboard loads up front. Everything else, and in particular the
// chart library, is fetched on first navigation so opening the app on a phone
// costs as little as possible.
const Mission = lazy(() => import('./pages/Mission').then((m) => ({ default: m.Mission })))
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })))
const CheckIn = lazy(() => import('./pages/CheckIn').then((m) => ({ default: m.CheckIn })))
const Integrations = lazy(() => import('./pages/Integrations').then((m) => ({ default: m.Integrations })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const Display = lazy(() => import('./pages/Display').then((m) => ({ default: m.Display })))

/** Digits in the unlock code. Must match the code hash held by the edge function. */
const CODE_LENGTH = Number(import.meta.env.VITE_CODE_LENGTH ?? 4)

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">{children}</div>
  )
}

function RouteFallback() {
  return <p className="py-20 text-center text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Loading</p>
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Display mode sits outside the chrome: no nav, no banners. */}
        <Route path="/display" element={<Display />} />
        <Route path="/dashboard" element={<Navigate to="/display" replace />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/mission" element={<Mission />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/check-in" element={<CheckIn />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

/**
 * The code is the only way in.
 *
 * There is no password screen. The code is checked by an edge function that
 * holds the account credentials as server secrets and returns a session, so
 * nothing sensitive is present in the published bundle. The session that comes
 * back is a normal Supabase session, which means every request afterwards is
 * still governed by row-level security exactly as before.
 */
function Shell() {
  const { session, loading } = useAuth()
  const [unlocked, setUnlocked] = useState(isUnlocked)

  if (!isConfigured) {
    return (
      <Centered>
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold tracking-[0.2em] text-[var(--color-accent-text)]">
            MANU FITNESS
          </h1>
          <p className="mt-6 rounded-[var(--radius-control)] border border-[var(--color-warn-edge)] bg-[var(--color-warn-quiet)] p-4 text-sm text-[var(--color-warn-text)]">
            This build has no backend configured. Set <code className="font-mono">VITE_SUPABASE_URL</code>{' '}
            and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>, or run with{' '}
            <code className="font-mono">VITE_DEMO_MODE=1</code>.
          </p>
        </div>
      </Centered>
    )
  }

  if (loading) {
    return (
      <Centered>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Loading</p>
      </Centered>
    )
  }

  // A stored session still has to clear the lock screen, so reopening the app
  // asks for the code rather than walking straight in.
  if (!session || !unlocked) {
    return <PinLock codeLength={CODE_LENGTH} onUnlocked={() => setUnlocked(true)} />
  }

  return (
    <DataProvider>
      <AppRoutes />
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      {/* HashRouter, because static hosts cannot rewrite deep links to index.html. */}
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}
