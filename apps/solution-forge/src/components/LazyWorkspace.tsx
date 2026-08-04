/**
 * Suspense + error boundary around a lazily loaded workspace.
 *
 * WHY THIS EXISTS: the Code Apps player only serves files that `index.html`
 * references (CLAUDE.md gotcha #10). A `React.lazy()` chunk is fetched at
 * runtime and is NOT referenced there, so it may come back 404 — and an
 * uncaught import failure blanks the whole app. This boundary turns that into
 * a readable message, which is what makes the lazy experiment safe to run in a
 * real player session: the worst case is one broken menu item, not a white
 * screen.
 *
 * Retry is a full page reload on purpose. `React.lazy` caches the rejected
 * import promise, so re-rendering the same lazy component would replay the
 * failure without ever re-fetching.
 */
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Feature name, used in the loading and failure messages. */
  name: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Whether the error is a failed dynamic import rather than a crash inside the
 * loaded feature. The message differs per browser, hence the loose match.
 */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|module script failed|Failed to fetch|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  )
}

class LazyErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Same diagnostic channel as the rest of the app (gotcha #11 — there is no
    // debugger on the deployed player, console output is what we get).
    console.warn(
      `[lazy] ${this.props.name} failed to load`,
      error,
      info.componentStack,
    )
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunkMissing = isChunkLoadError(error)
    return (
      <div className="state state--error">
        <strong>{this.props.name} could not be loaded.</strong>
        <p>
          {chunkMissing
            ? 'Its code is loaded on demand, and the app player did not serve that file. On-demand loading is therefore not supported here — the feature has to be bundled statically again.'
            : 'The feature loaded but crashed while starting up.'}
        </p>
        <p className="muted">{`${error.name}: ${error.message}`}</p>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => window.location.reload()}
        >
          Reload app
        </button>
      </div>
    )
  }
}

export function LazyWorkspace({ name, children }: Props) {
  return (
    <LazyErrorBoundary name={name}>
      <Suspense fallback={<div className="state">Loading {name}…</div>}>
        {children}
      </Suspense>
    </LazyErrorBoundary>
  )
}
