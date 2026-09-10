import { useCallback, useEffect, useState } from 'react'
import { auditService } from '../services/auditService'
import { collectPrincipalRefs } from '../utils/principals'

/**
 * Display names for owner references appearing in a set of raw values.
 *
 * Returns a map keyed `entityname,guid`; anything unresolved is absent, so
 * callers keep whatever they were showing before. The service caches per
 * session, so re-rendering the same rows costs nothing.
 */
export function usePrincipalNames(
  values: (string | undefined)[],
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  // Stable dependency: the sorted key list, not the array identity.
  const keys = collectPrincipalRefs(values).sort().join('|')

  const load = useCallback(async () => {
    if (!keys) {
      setNames({})
      return
    }
    setNames(await auditService.resolvePrincipals(keys.split('|')))
  }, [keys])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return names
}
