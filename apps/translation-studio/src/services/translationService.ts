import type { ComponentInfo, ExportResult, ImportJobState, Lcid, SetupCheck, SolutionRef, TranslationFile } from '../types/translation'
import { powerModeReady } from '../PowerProvider'
import { dataverseTranslationService } from './dataverseTranslationService'
import { mockTranslationService } from './mockTranslationService'

/**
 * Everything the UI needs from Dataverse. One path per direction: the native
 * translation export/import (one action each, all component types in one
 * format) — no metadata updates, which the connector can't do (PUT).
 */
export interface TranslationService {
  readonly source: 'dataverse' | 'mock'
  /** Org URL the service talks to ('' for the mock). */
  readonly orgUrl: string
  /** Visible solutions, unmanaged and managed (managed are read-only in the UI). */
  listSolutions(): Promise<SolutionRef[]>
  /** Base language of the organization (`organization.languagecode`); null when unreadable. */
  baseLanguage(): Promise<Lcid | null>
  /** `ExportTranslation` — the zip with `CrmTranslations.xml`. */
  exportTranslations(solutionUniqueName: string): Promise<ExportResult>
  /** Table/name per object id of the file (best effort, for filters and display). */
  resolveComponents(file: TranslationFile): Promise<Map<string, ComponentInfo>>
  /**
   * `ImportTranslation` with a new import job id. Resolves when the call
   * returns (the import may still run); progress via {@link getImportJob}.
   */
  importTranslations(zipBase64: string, importJobId: string): Promise<void>
  /** The `importjob` row; null while it doesn't exist yet. */
  getImportJob(id: string, withLog: boolean): Promise<ImportJobState | null>
  /** Import jobs not completed yet, started within the last hours (one import at a time). */
  runningImports(): Promise<ImportJobState[]>
  /** `PublishAllXml`. */
  publishAll(): Promise<void>
  /** Environment checks for the setup page (without the export probe). */
  checkSetup(): Promise<SetupCheck[]>
}

/**
 * Picks the implementation once the host probe is done. No silent fallback
 * to the mock on errors: an import that "succeeds" against the mock would lie.
 */
export async function getTranslationService(): Promise<TranslationService> {
  const mode = await powerModeReady
  return mode === 'power-platform' ? dataverseTranslationService : mockTranslationService
}
