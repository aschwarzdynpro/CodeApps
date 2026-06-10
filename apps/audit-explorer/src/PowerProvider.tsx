import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * PowerProvider initializes the Power Apps SDK so the app can read the
 * Dataverse Audit table and call audit messages (RetrieveRecordChangeHistory,
 * RetrieveAuditDetails) at runtime.
 *
 * NOTE: Running `power-apps init` wires up the real initialization and a
 * generated `power.config.json`. Until then (plain local `npm run dev`) this
 * provider falls back to "local-mock" mode so the dashboard stays runnable on
 * the sample data in src/services.
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
 * probing the SDK. Service-layer code awaits this before touching the
 * generated Dataverse client — calling `AuditsService.getAll(...)` without
 * a real Power Platform host stalls inside an SDK connection lookup rather
 * than throwing, so a plain try/catch wouldn't recover.
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
        // Resolved dynamically so the local build doesn't hard-depend on the
        // generated SDK entry point. `power-apps init` provides the real one.
        const specifier = '@microsoft/power-apps'
        const mod: { initialize?: () => Promise<void> } = await import(
          /* @vite-ignore */ specifier
        )
        if (mod?.initialize) {
          await mod.initialize()
          mode = 'power-platform'
        }
      } catch {
        // Not running inside Power Platform — use local mock data.
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
