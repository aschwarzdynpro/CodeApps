import { useCallback, useEffect, useState } from 'react'
import type { SalesData } from '../types/sales'
import { salesService } from '../services/salesService'

interface SalesDataState {
  data: SalesData | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/** Lädt den Dashboard-Datenbestand und stellt einen manuellen Refresh bereit. */
export function useSalesData() {
  const [state, setState] = useState<SalesDataState>({
    data: null,
    loading: true,
    error: null,
    lastUpdated: null,
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await salesService.load()
      setState({ data, loading: false, error: null, lastUpdated: new Date() })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden',
      }))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, refresh: load }
}
