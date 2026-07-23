import type { DualWriteMapSummary } from '../types/dualWrite'
import { dataverseDualWriteService } from './dataverseDualWriteService'

/**
 * Dual-Write Table Maps cockpit service. Reads the custom (unmanaged)
 * `msdyn_dualwriteentitymap` records in the CURRENT environment through the
 * connector (FetchXML passthrough, SP identity). Read-only.
 */
export interface DualWriteService {
  /**
   * Whether Dual-Write is installed in the host environment (the
   * `msdyn_dualwriteentitymap` table exists). Drives the visibility of the
   * whole menu entry. Fails OPEN: a probe error reports true so a transient
   * hiccup never hides a working feature.
   */
  isInstalled(): Promise<boolean>
  /**
   * Custom (unmanaged) dual-write table maps in the current environment — one
   * entry per map name at its current (highest) version, with the owner and a
   * count of how many version records exist.
   */
  listTableMaps(): Promise<DualWriteMapSummary[]>
  /**
   * Raw `msdyn_mapping` JSON for one map record. Loaded lazily when the detail
   * overlay opens (the payload is large — a full field-mapping definition).
   */
  getMapping(id: string): Promise<string>
}

export const dualWriteService: DualWriteService = dataverseDualWriteService
