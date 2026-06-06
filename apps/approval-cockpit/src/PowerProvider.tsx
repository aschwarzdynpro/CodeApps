import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * PowerProvider initializes the Power Apps SDK so the app can talk to
 * Power Platform data sources and connectors at runtime.
 *
 * NOTE: Running `power-apps init` wires up the real initialization and a
 * generated `power.config.json`. Until then (e.g. plain local `npm run dev`)
 * this provider falls back to "local-mock" mode so the UI stays runnable and
 * the mock service layer (see src/services) serves sample data.
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

export function PowerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PowerContextValue>({
    ready: false,
    mode: 'local-mock',
  })

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        // Resolved dynamically so the local build doesn't hard-depend on the
        // generated SDK entry point. `power-apps init` provides the real one.
        const specifier = '@microsoft/power-apps'
        const mod: { initialize?: () => Promise<void> } = await import(
          /* @vite-ignore */ specifier
        )
        if (mod?.initialize) {
          await mod.initialize()
          if (!cancelled) setState({ ready: true, mode: 'power-platform' })
          return
        }
      } catch {
        // Not running inside Power Platform — use local mock data.
      }
      if (!cancelled) setState({ ready: true, mode: 'local-mock' })
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
