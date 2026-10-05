import { decodeXml, encodeXmlText } from './spreadsheetXml'

/**
 * Merges the `CrmTranslations.xml` of several partial exports into one file
 * that reads like a single export (chunked export of a large solution).
 *
 * The first part is the frame (styles, Information sheet); the rows of
 * "Localized Labels" and "Display Strings" are the union of all parts, each
 * label once (key: component group, object id, column — or group and key for
 * display strings), in the order the parts come. A row's texts are the same
 * in every part that carries it (same environment, same moment), so the first
 * one wins.
 */

/** Key cells per sheet. */
const SHEETS: Record<string, number> = { 'Localized Labels': 3, 'Display Strings': 2 }

export interface ExtraLabel {
  /** `Entity name` column, e.g. `appaction`. */
  group: string
  objectId: string
  column: string
  /** Text per LCID; languages the file doesn't have are ignored. */
  texts: Record<number, string>
}

export interface MergeOptions {
  /** Whether a row of a part belongs in the result (`cells`: the row's texts, first the key cells). */
  keep?: (sheet: string, cells: string[]) => boolean
  /** Labels no part carries (read separately), appended to "Localized Labels" unless a part has them. */
  extra?: ExtraLabel[]
  /** Unique name for the Information sheet (the parts carry their temporary names). */
  solutionName?: string
}

const ROW = /<Row\b[^>]*>[\s\S]*?<\/Row>/g
const CELL = /<Cell\b[^>]*?(?:\/>|>([\s\S]*?)<\/Cell>)/g
const DATA = /<Data\b[^>]*>([\s\S]*?)<\/Data>/

/** The texts of a row's cells (empty for a cell without data). */
export function cellTexts(row: string): string[] {
  const out: string[] = []
  for (const m of row.matchAll(CELL)) out.push(decodeXml(m[1]?.match(DATA)?.[1] ?? ''))
  return out
}

interface SheetSpan {
  /** Index of the first `<Row` (or of `</Table>` when there are none). */
  rowsStart: number
  /** Index of `</Table>`. */
  tableEnd: number
}

function sheetSpan(xml: string, sheet: string): SheetSpan | null {
  const open = xml.search(new RegExp(`<Worksheet\\b[^>]*ss:Name="${sheet}"`))
  if (open < 0) return null
  const tableEnd = xml.indexOf('</Table>', open)
  if (tableEnd < 0) return null
  const firstRow = xml.indexOf('<Row', open)
  return { rowsStart: firstRow >= 0 && firstRow < tableEnd ? firstRow : tableEnd, tableEnd }
}

function sheetRows(xml: string, sheet: string): string[] {
  const span = sheetSpan(xml, sheet)
  return span ? (xml.slice(span.rowsStart, span.tableEnd).match(ROW) ?? []) : []
}

function rowXml(cells: string[], keyCells: number): string {
  const cell = (text: string, i: number) => `<Cell ss:StyleID="${i < keyCells ? 's22' : 's24'}"><Data ss:Type="String">${encodeXmlText(text)}</Data></Cell>`
  return `<Row ss:AutoFitHeight="0">${cells.map(cell).join('')}</Row>`
}

export function mergeTranslationXml(parts: string[], o: MergeOptions = {}): string {
  if (parts.length === 0) throw new Error('Keine Teil-Exporte zum Zusammenführen.')
  let out = parts[0]
  for (const [sheet, keyCells] of Object.entries(SHEETS)) {
    const header = sheetRows(parts[0], sheet)[0]
    if (!header) continue
    const headerKey = cellTexts(header).join('|')
    const seen = new Set<string>()
    const rows: string[] = [header]
    for (const part of parts) {
      const [head, ...body] = sheetRows(part, sheet)
      if (!head) continue
      if (cellTexts(head).join('|') !== headerKey) throw new Error(`Die Teil-Exporte haben unterschiedliche Spalten („${sheet}“).`)
      for (const row of body) {
        const cells = cellTexts(row)
        const key = cells.slice(0, keyCells).join('\u0001')
        if (seen.has(key) || (o.keep && !o.keep(sheet, cells))) continue
        seen.add(key)
        rows.push(row)
      }
    }
    if (sheet === 'Localized Labels') {
      const languages = cellTexts(header).slice(keyCells).map(Number)
      for (const e of o.extra ?? []) {
        const key = [e.group, e.objectId, e.column].join('\u0001')
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(rowXml([e.group, e.objectId, e.column, ...languages.map((l) => e.texts[l] ?? '')], keyCells))
      }
    }
    const span = sheetSpan(out, sheet)!
    out = out.slice(0, span.rowsStart) + rows.join('') + out.slice(span.tableEnd)
  }
  if (o.solutionName) {
    out = out.replace(/(Solution Name:<\/Data><\/Cell><Cell\b[^>]*><Data\b[^>]*>)[^<]*/, (_, head: string) => head + encodeXmlText(o.solutionName!))
  }
  return out
}
