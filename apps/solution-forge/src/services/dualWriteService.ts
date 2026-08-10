import type { DualWriteMapSummary } from '../types/dualWrite'
import { dataverseDualWriteService } from './dataverseDualWriteService'

/**
 * Dual-Write Table Maps cockpit service. Reads the custom (unmanaged)
 * `msdyn_dualwriteentitymap` records of a CHOSEN environment through the
 * connector (FetchXML passthrough, SP identity). Read-only.
 *
 * Every method takes an `envKey` from the configured `ENVIRONMENTS`; the
 * queries are pointed at `orgUrlForEnvKey(envKey)`, so the maps of UAT/PROD can
 * be compared against the host's without leaving the app. The SP behind the
 * connector needs read access on the dual-write tables in each environment it
 * is asked about.
 */
export interface DualWriteService {
  /**
   * Whether Dual-Write is installed in an environment (the
   * `msdyn_dualwriteentitymap` table exists). Called without an argument for
   * the host env, where it drives the visibility of the whole menu entry, and
   * per selected environment by the cockpit, which turns a `false` into a
   * plain "not installed here" instead of a query error. Fails OPEN: a probe
   * error reports true so a transient hiccup never hides a working feature.
   */
  isInstalled(envKey?: string): Promise<boolean>
  /**
   * Custom (unmanaged) dual-write table maps in the given environment — one
   * entry per map name, with a count of how many version records exist.
   *
   * The version shown is the RUNNING one where `msdyn_dualwriteruntimeconfig`
   * records it, otherwise the newest saved one, flagged via
   * `DualWriteMapSummary.versionKind`. It is deliberately NOT the highest
   * version number: parked sentinel versions (9.9.9.9) would win that.
   */
  listTableMaps(envKey: string): Promise<DualWriteMapSummary[]>
  /**
   * Raw `msdyn_mapping` JSON for one map record in the given environment.
   * Loaded lazily when the detail overlay opens (the payload is large — a full
   * field-mapping definition).
   */
  getMapping(id: string, envKey: string): Promise<string>
}

export const dualWriteService: DualWriteService = dataverseDualWriteService
