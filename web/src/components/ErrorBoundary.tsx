import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * The last line of defence, and the one this app specifically needs.
 *
 * Every route except the dashboard is `React.lazy`, so opening one fetches a
 * chunk by its hashed filename. This is also a PWA: a phone can be holding a
 * cached index.html from last week that names chunks a new deploy has already
 * renamed. The fetch 404s, the promise rejects, React unmounts the tree, and
 * the app becomes a white screen with no way back. Reloading fixes it, because
 * that is what pulls the new index.html, but nothing on a blank page says so.
 *
 * A stale chunk is therefore not an exotic failure here. It is the expected
 * outcome of shipping an update to an installed app, which happens routinely.
 */

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Whether this looks like a chunk that moved under us rather than a real bug. */
function isStaleChunk(error: Error): boolean {
  const text = `${error.name} ${error.message}`
  return (
    /dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /ChunkLoadError/i.test(text) ||
    /Loading chunk \d+ failed/i.test(text)
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry in this app by design, so the console is the record.
    console.error('Unhandled error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isStaleChunk(error)

    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">
            {stale ? 'A newer version is available' : 'Something went wrong'}
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-muted)]">
            {stale
              ? 'This app updated while it was open, so part of it could not load. Reloading picks up the new version.'
              : 'This screen failed to load. Your data is safe: nothing is stored in the app itself.'}
          </p>

          <button
            type="button"
            onClick={() => {
              // A stale chunk survives a soft reload if the worker keeps serving
              // the old index.html, so clear it out on the way past.
              const done = () => window.location.reload()
              if (stale && 'serviceWorker' in navigator) {
                navigator.serviceWorker
                  .getRegistrations()
                  .then((rs) => Promise.all(rs.map((r) => r.unregister())))
                  .then(() => (window.caches ? caches.keys() : Promise.resolve([] as string[])))
                  .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
                  .then(done, done)
              } else {
                done()
              }
            }}
            className="mt-6 min-h-11 rounded-[var(--radius-control)] bg-[var(--color-accent-fill)]
              px-5 text-sm font-semibold text-[var(--color-on-accent)]
              shadow-[var(--shadow-raised)] transition duration-200
              ease-[cubic-bezier(0.32,0.72,0,1)] hover:brightness-110 active:scale-[0.97]"
          >
            Reload
          </button>

          {!stale && (
            <p className="mt-5 break-words text-xs text-[var(--color-muted)]">{error.message}</p>
          )}
        </div>
      </div>
    )
  }
}
