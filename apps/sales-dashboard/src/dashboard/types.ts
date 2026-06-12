/**
 * Generisches Kachel-Framework des Dashboards.
 *
 * Jede der sechs Kacheln (Aktivitäten, Leads, Verkaufschancen, Projekte,
 * Angebote, Aufträge) ist eine deklarative {@link TileDef}: Ansichten
 * (= Legacy-SavedQueries), Diagramme (= Legacy-Visualizations) und
 * Grid-Spalten (= Legacy-layoutxml). Die UI-Komponenten interpretieren
 * nur diese Definitionen — neue Ansichten/Diagramme sind reine Konfiguration.
 */

export interface ViewContext {
  /** Das "ich" der "Meine …"-Ansichten (eq-userid der Legacy-FetchXML). */
  userId: string
  now: Date
}

export type BadgeTone = 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'gray'

export interface ColumnDef<T> {
  key: string
  label: string
  kind?: 'text' | 'currency' | 'date' | 'number' | 'badge'
  value: (row: T) => string | number | undefined
  /** Farbton für kind = 'badge'. */
  tone?: (row: T) => BadgeTone
}

export interface ViewDef<T> {
  id: string
  label: string
  filter: (row: T, ctx: ViewContext) => boolean
  sort: (a: T, b: T) => number
}

export type ChartKind = 'donut' | 'column' | 'stacked-column' | 'funnel'

export interface ChartDef<T> {
  id: string
  label: string
  kind: ChartKind
  format: 'number' | 'currency'
  groupBy: (row: T) => string
  /**
   * Stabiler Sortierschlüssel je Gruppe (z. B. Kalenderwoche).
   * Ohne groupOrder/groupSortKey werden Gruppen nach Wert absteigend sortiert.
   */
  groupSortKey?: (row: T) => number
  /** Feste Reihenfolge (z. B. Forecast-Funnel); gewinnt vor groupSortKey. */
  groupOrder?: readonly string[]
  /** Zweite Dimension für gestapelte Säulen. */
  stackBy?: (row: T) => string
  /** Summen-Maß; ohne Angabe wird gezählt. */
  measure?: (row: T) => number
  /** Kappung der Kategorien (Rest → "Weitere"). */
  maxCategories?: number
}

export type TileIconName =
  | 'activity'
  | 'lead'
  | 'opportunity'
  | 'project'
  | 'quote'
  | 'order'

export interface TileDef<T> {
  id: string
  title: string
  icon: TileIconName
  /** Akzentfarbe der Kachel (Icon-Hintergrund, aktive Elemente). */
  accent: string
  views: ViewDef<T>[]
  charts: ChartDef<T>[]
  columns: ColumnDef<T>[]
  rowId: (row: T) => string
  /** Volltext für die Schnellsuche der Kachel (Legacy: EnableQuickFind). */
  searchText: (row: T) => string
}

/** Moderne, kontrastreiche Diagramm-Palette (Reihenfolge = Segment-Index). */
export const CHART_PALETTE = [
  '#2e7cd6',
  '#12a594',
  '#e5862b',
  '#8e5cd9',
  '#d6409f',
  '#46a758',
  '#dc4b4b',
  '#0d9dac',
  '#937264',
  '#647084',
] as const

export const chartColor = (index: number): string =>
  CHART_PALETTE[index % CHART_PALETTE.length]
