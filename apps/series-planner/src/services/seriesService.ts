import type {
  AvailabilityData,
  LookupKind,
  OccurrenceRecord,
  PlannedOccurrence,
  Ref,
  Series,
  SeriesDraft,
  SeriesSummary,
} from '../types/series'
import { powerModeReady } from '../PowerProvider'
import { dataverseSeriesService } from './dataverseSeriesService'
import { mockSeriesService } from './mockSeriesService'

export interface SetupCheck {
  label: string
  ok: boolean
  detail: string
}

/**
 * Everything the UI needs from Dataverse. The UI never writes work orders or
 * bookings directly — it computes a plan (src/utils/planner.ts) and runs its
 * actions through createOccurrence / updateOccurrence / cancelOccurrence.
 */
export interface SeriesService {
  readonly source: 'dataverse' | 'mock'

  listSeries(): Promise<SeriesSummary[]>
  getSeries(id: string): Promise<Series>
  createSeries(draft: SeriesDraft): Promise<string>
  /** Writes settings + definition; refuses with ConflictError when the row moved on. Returns the saved series. */
  updateSeries(original: Series, draft: SeriesDraft): Promise<Series>
  setActive(id: string, active: boolean): Promise<void>

  /** Work orders of the series with their current booking. */
  listOccurrences(seriesId: string): Promise<OccurrenceRecord[]>
  /** New work order (linked to project and series) plus booking. */
  createOccurrence(series: Series, occ: PlannedOccurrence): Promise<OccurrenceRecord>
  /** Moves / re-assigns the booking; books the work order when it has none. */
  updateOccurrence(series: Series, record: OccurrenceRecord, occ: PlannedOccurrence): Promise<void>
  /** Cancels booking and work order. Nothing is deleted. */
  cancelOccurrence(record: OccurrenceRecord, reason: string): Promise<void>

  /** Holidays, working time and bookings of `resourceIds` between two instants. */
  loadAvailability(resourceIds: string[], from: string, to: string): Promise<AvailabilityData>

  search(kind: LookupKind, term: string, context?: { projectId?: string }): Promise<Ref[]>
  /** Names for IDs (resources in the definition). Unknown IDs are left out. */
  resolveRefs(kind: LookupKind, ids: string[]): Promise<Ref[]>
  /** Suggestions when a project is picked: its customer as service account. */
  projectDefaults(projectId: string): Promise<{ serviceAccount: Ref | null }>
  /** Status for new bookings: the committed "Scheduled"/"Geplant" one. */
  defaultBookingStatus(): Promise<Ref | null>
  /** What the environment provides — shown under "Einrichtung". */
  checkSetup(): Promise<SetupCheck[]>
}

/** Mock without a Power Apps host; no silent fallback on errors (writes must never seem to succeed). */
export async function getSeriesService(): Promise<SeriesService> {
  const mode = await powerModeReady
  return mode === 'power-platform' ? dataverseSeriesService : mockSeriesService
}
