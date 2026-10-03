import type { WorkbookLoc } from '../utils/spreadsheetXml'

/** Language code id (1033 en-US, 1031 de-DE, 1036 fr-FR …). */
export type Lcid = number

/** Component categories the scope and the filters work with. */
export type ComponentKind = 'table' | 'column' | 'choice' | 'form' | 'view' | 'other'

/** A worksheet of the translation file that carries language columns. */
export interface SheetInfo {
  name: string
  /** Header texts of the columns before the first language column. */
  keyColumns: string[]
  /** Language columns of this sheet, in file order. */
  languages: Lcid[]
  rowCount: number
}

/** One label: one row of a translation sheet. */
export interface LabelRow {
  /** Stable key: sheet + key column values (+ `#n` for a repeated key). */
  key: string
  sheet: string
  /** Values of the key columns, in header order. */
  keys: string[]
  /** `Entity Name` of a Localized Labels row (Attribute, Entity …); '' elsewhere. */
  type: string
  objectId: string
  /** `Object Column Name` (DisplayName, Description …) or the display string key. */
  column: string
  kind: ComponentKind
  /** Text per language as exported. */
  original: Record<Lcid, string>
  /** Text per language with edits applied (equals `original` without edits). */
  values: Record<Lcid, string>
  /** Index into the scanned layout (internal, for the writer). */
  loc: { sheet: number; row: number }
}

export interface TranslationFile {
  /** The `CrmTranslations.xml` text exactly as exported. */
  xml: string
  baseLanguage: Lcid
  /** All language columns, base language first. */
  languages: Lcid[]
  /** Key/value pairs of the "Information" sheet. */
  info: { label: string; value: string }[]
  sheets: SheetInfo[]
  rows: LabelRow[]
  /** Positions in `xml` (internal, for the writer). */
  layout: WorkbookLoc
  /** Column number (1-based) of each language, per translation sheet index. */
  columnsBySheet: Record<number, Record<Lcid, number>>
}

/** One edited cell. */
export interface CellEdit {
  rowKey: string
  lcid: Lcid
  value: string
}

/** A cell whose text differs from the export. */
export interface CellChange {
  rowKey: string
  lcid: Lcid
  before: string
  after: string
}

/** Id of one cell in edit maps and the acknowledged set. */
export const cellId = (rowKey: string, lcid: Lcid): string => `${rowKey}\u0001${lcid}`

/** State of one translation cell in the matrix. */
export type CellState = 'missing' | 'untranslated' | 'changed' | 'ok'

/** Context of an object id, resolved from metadata (optional). */
export interface ComponentInfo {
  /** Logical name of the table the label belongs to. */
  table?: string
  /** Readable name of the component (form name, column logical name …). */
  name?: string
  /** Kind from metadata where the file can't tell (choice value vs. column, view vs. form). */
  kind?: ComponentKind
  /** `systemform.type` of a form (2 main, 5 mobile, 6 quick view, 7 quick create, 11 card, 0 dashboard). */
  formType?: number
}

/** One form as the designer needs it. */
export interface FormRecord {
  id: string
  name: string
  /** Logical name of the table ('' for a dashboard without table). */
  table: string
  type: number
  formxml: string
}

/** One view (`savedquery`) as the designer needs it. */
export interface ViewRecord {
  id: string
  name: string
  table: string
  /** `querytype` (0 public, 1 advanced find, 2 associated, 4 quick find, 64 lookup …). */
  queryType: number
  layoutxml: string
  fetchxml: string
}

/** A model-driven app with its sitemap. */
export interface AppRecord {
  /** `appmoduleid` ('' when only the sitemap is known). */
  id: string
  name: string
  uniqueName: string
  sitemap: { id: string; xml: string } | null
}

/** The options of one choice column, for grouping choice values under their column. */
export interface ChoiceGroup {
  /** Logical name of the column. */
  attribute: string
  options: { value: number; metadataId: string; label: string }[]
}

export interface SolutionRef {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  isManaged: boolean
  publisher: string
}

export interface ImportJobState {
  id: string
  /** 0–100. */
  progress: number
  startedOn: string | null
  completedOn: string | null
  /** Raw `importjob.data` (XML log) once available. */
  data: string | null
}

export interface SetupCheck {
  id: string
  label: string
  ok: boolean | null
  detail: string
}

export interface ExportResult {
  /** The zip as returned by ExportTranslation. */
  zip: Uint8Array
  /** How the action was reached (shown on the setup page). */
  route: string
}
