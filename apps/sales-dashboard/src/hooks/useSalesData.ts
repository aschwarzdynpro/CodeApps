import { useCallback, useEffect, useRef, useState } from 'react'
import type { SalesData, UserRef } from '../types/sales'
import { salesService } from '../services/salesService'
import { mockSalesService } from '../services/mockSalesService'

interface SalesDataState {
  data: SalesData | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/** Ladefortschritt fürs Overlay: `done` von `total` Bereichen, letzter Name. */
export interface LoadProgressState {
  done: number
  total: number
  label?: string
}

/**
 * Lädt den Dashboard-Datenbestand und stellt einen manuellen Refresh bereit.
 *
 * @param forceMock Demo-Schalter im Header: erzwingt die Demo-Daten auch
 *   innerhalb eines Power-Apps-Hosts (zum Testen). Außerhalb des Hosts
 *   liefert der Live-Service ohnehin Demo-Daten.
 * @param gvlId Optionale GVL-Auswahl: aus deren Sicht wird das Dashboard
 *   geladen. Ändert sie sich, wird neu geladen (Live: serverseitige Filter auf
 *   die GVL). Ohne Angabe greift der Standard = angemeldeter Benutzer.
 */
export function useSalesData(forceMock: boolean, gvlId?: string) {
  const [state, setState] = useState<SalesDataState>({
    data: null,
    loading: true,
    error: null,
    lastUpdated: null,
  })

  const service = forceMock ? mockSalesService : salesService

  // Ladefortschritt je Bereich (treibt das Overlay beim GVL-Wechsel/Refresh).
  const [progress, setProgress] = useState<LoadProgressState | null>(null)

  // Stale-Guard: nur die zuletzt gestartete Ladung darf den State setzen, damit
  // eine spät eintreffende ältere Antwort (schneller GVL-Wechsel) eine neuere
  // nicht überschreibt.
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setProgress(null)
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await service.load(gvlId, (done, total, label) => {
        if (seq === loadSeq.current) setProgress({ done, total, label })
      })
      if (seq !== loadSeq.current) return
      setState({ data, loading: false, error: null, lastUpdated: new Date() })
      setProgress(null)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden',
      }))
      setProgress(null)
    }
  }, [service, gvlId])

  useEffect(() => {
    void load()
  }, [load])

  // GVL-Kandidaten für das Suchfeld — gebunden an den aktiven Service.
  const listSalesManagers = useCallback(
    (): Promise<UserRef[]> => service.listSalesManagers(),
    [service],
  )

  return { ...state, progress, refresh: load, listSalesManagers }
}
