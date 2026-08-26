import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { DataProvider } from './lib/data'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'

// Only the dashboard and the check-in form load up front. Everything else, and
// in particular the chart library, is fetched on first navigation so opening
// the app on a phone costs as little as possible.
const Mission = lazy(() => import('./pages/Mission').then((m) => ({ default: m.Mission })))
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })))
const CheckIn = lazy(() => import('./pages/CheckIn').then((m) => ({ default: m.CheckIn })))
const Integrations = lazy(() => import('./pages/Integrations').then((m) => ({ default: m.Integrations })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const Display = lazy(() => import('./pages/Display').then((m) => ({ default: m.Display })))

function RouteFallback() {
  return <p className="py-20 text-center text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Loading</p>
}

function Shell() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Loading</p>
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <DataProvider>
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
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      {/* HashRouter, because GitHub Pages cannot rewrite deep links to index.html. */}
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}
