import { useCallback, useEffect, useState } from 'react'
import type { SalesData } from '../types/sales'
import { salesService } from '../services/salesService'
import { mockSalesService } from '../services/mockSalesService'

interface SalesDataState {
  data: SalesData | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/**
 * Lädt den Dashboard-Datenbestand und stellt einen manuellen Refresh bereit.
 *
 * @param forceMock Demo-Schalter im Header: erzwingt die Demo-Daten auch
 *   innerhalb eines Power-Apps-Hosts (zum Testen). Außerhalb des Hosts
 *   liefert der Live-Service ohnehin Demo-Daten.
 */
export function useSalesData(forceMock: boolean) {
  const [state, setState] = useState<SalesDataState>({
    data: null,
    loading: true,
    error: null,
    lastUpdated: null,
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const service = forceMock ? mockSalesService : salesService
      const data = await service.load()
      setState({ data, loading: false, error: null, lastUpdated: new Date() })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden',
      }))
    }
  }, [forceMock])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, refresh: load }
}
