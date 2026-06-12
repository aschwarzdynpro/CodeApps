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
 * Same pattern as apps/audit-explorer — keep the two in sync when upgrading
 * the SDK.
 */

export type PowerMode = 'power-platform' | 'local-mock'

interface PowerContextValue {
  ready: boolean
  mode: PowerMode
}

const PowerContext = createContext<PowerContextValue>({
  ready: false,
  mode: 'local-mock',
})

// eslint-disable-next-line react-refresh/only-export-components
export const usePower = () => useContext(PowerContext)

/**
 * Promise that resolves to the active mode once the provider has finished
 * probing the SDK. A future Dataverse-backed service awaits this before
 * touching generated clients — outside a Power Apps host their connection
 * lookup stalls instead of throwing.
 */
let resolveMode: (mode: PowerMode) => void = () => {}
// eslint-disable-next-line react-refresh/only-export-components
export const powerModeReady = new Promise<PowerMode>((resolve) => {
  resolveMode = resolve
})

export function PowerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PowerContextValue>({
    ready: false,
    mode: 'local-mock',
  })

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      let mode: PowerMode = 'local-mock'
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
        if (ctx?.app?.appId) mode = 'power-platform'
      } catch {
        // Bridge threw — treat as standalone, use mock.
      }
      // Resolve regardless of cancellation so any pending service calls unblock.
      resolveMode(mode)
      if (!cancelled) setState({ ready: true, mode })
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
