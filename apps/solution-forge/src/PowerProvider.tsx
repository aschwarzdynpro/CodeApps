import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getContext } from '@microsoft/power-apps/app'

/**
 * PowerProvider detects whether the app is running inside a Power Apps host
 * (Studio / Player iframe) or standalone (plain Vite on localhost).
 *
 * Detection: `getContext()` uses an internal PostMessage bridge to the parent
 * iframe. Inside the host the parent replies with the app context; standalone
 * the call hangs forever, so we race it against a short timeout and treat the
 * timeout as `local-mock`.
 *
 * On top of the audit-explorer original this provider also extracts the
 * environment id from the host context (when present) so the app can build
 * maker-portal deep links without hardcoding the environment.
 */

export type PowerMode = 'power-platform' | 'local-mock'

interface PowerContextValue {
  ready: boolean
  mode: PowerMode
  /** Dataverse environment id reported by the host, or null standalone. */
  environmentId: string | null
}

const PowerContext = createContext<PowerContextValue>({
  ready: false,
  mode: 'local-mock',
  environmentId: null,
})

// eslint-disable-next-line react-refresh/only-export-components
export const usePower = () => useContext(PowerContext)

/**
 * Promise that resolves to the active mode once the provider has finished
 * probing the SDK. Service-layer code awaits this before touching the
 * generated Dataverse client — calling the generated services without a real
 * Power Platform host stalls inside an SDK connection lookup rather than
 * throwing, so a plain try/catch wouldn't recover.
 */
let resolveMode: (mode: PowerMode) => void = () => {}
// eslint-disable-next-line react-refresh/only-export-components
export const powerModeReady = new Promise<PowerMode>((resolve) => {
  resolveMode = resolve
})

/**
 * The context payload isn't fully typed by the SDK, so probe the plausible
 * locations for an environment id defensively.
 */
function extractEnvironmentId(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== 'object') return null
  const root = ctx as Record<string, unknown>
  const candidates: unknown[] = [
    (root.environment as Record<string, unknown> | undefined)?.environmentId,
    (root.environment as Record<string, unknown> | undefined)?.id,
    (root.app as Record<string, unknown> | undefined)?.environmentId,
    root.environmentId,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return null
}

export function PowerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PowerContextValue>({
    ready: false,
    mode: 'local-mock',
    environmentId: null,
  })

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      let mode: PowerMode = 'local-mock'
      let environmentId: string | null = null
      try {
        // Inside a Power Apps host, getContext() resolves quickly via the
        // PostMessage bridge to the parent iframe. Standalone there is no
        // parent listener, so the call hangs — cap it with a 1.5s race.
        const ctx = await Promise.race<
          | { app?: { appId?: string } }
          | null
        >([
          getContext(),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
        ])
        if (ctx?.app?.appId) {
          mode = 'power-platform'
          environmentId = extractEnvironmentId(ctx)
        }
      } catch {
        // Bridge threw — treat as standalone, use mock.
      }
      // Resolve regardless of cancellation so any pending service calls unblock.
      resolveMode(mode)
      if (!cancelled) setState({ ready: true, mode, environmentId })
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PowerContext.Provider value={state}>{children}</PowerContext.Provider>
  )
}
