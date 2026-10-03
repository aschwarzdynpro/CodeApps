import type { CellChange, CellEdit, LabelRow, Lcid, SheetInfo, TranslationFile } from '../types/translation'
import { componentKind, isLcid } from './languages'
import { attributes, encodeXmlText, scanWorkbook, type CellLoc, type RowLoc } from './spreadsheetXml'

/**
 * `CrmTranslations.xml` as a model: read the labels, apply edits, write the
 * file back. Writing patches only the edited cells into the exported text, so
 * a file without edits serialises to exactly the bytes it was read from and
 * every sheet, row order, style and unknown column survives.
 */

/** Dataverse rejects labels longer than this on import (Microsoft Learn). */
export const MAX_LABEL_LENGTH = 500

const HEADER_SCAN_ROWS = 5

interface ParseOptions {
  /** Base language of the organization; defaults to the Information sheet, then the first language column. */
  baseLanguage?: Lcid
}

function cellText(row: RowLoc, col: number): string {
  return row.cells.find((c) => col >= c.col && col <= c.lastCol)?.text ?? ''
}

/**
 * Header row of a translation sheet: key column(s) followed by language
 * columns. A two-cell row like "Base Language Code | 1033" on the
 * information sheet is not one.
 */
function findHeader(sheetName: string, rows: RowLoc[]): number {
  if (/^information$/i.test(sheetName.trim())) return -1
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i++) {
    const cells = rows[i].cells
    const langs = cells.filter((c) => isLcid(c.text))
    const first = cells.findIndex((c) => isLcid(c.text))
    if (langs.length > 0 && first > 0 && (langs.length > 1 || cells.length > 2)) return i
  }
  return -1
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** Base language from the Information sheet ("Base Language Code" or similar). */
function baseFromInfo(info: { label: string; value: string }[]): Lcid | null {
  for (const { label, value } of info) {
    if (/base\s*language|basissprache/i.test(label) && isLcid(value)) return Number(value)
  }
  return null
}

export function parseTranslationFile(xml: string, options: ParseOptions = {}): TranslationFile {
  const layout = scanWorkbook(xml)
  const sheets: SheetInfo[] = []
  const rows: LabelRow[] = []
  const info: { label: string; value: string }[] = []
  const columnsBySheet: Record<number, Record<Lcid, number>> = {}
  const seen = new Map<string, number>()
  const order: Lcid[] = []

  layout.sheets.forEach((sheet, sheetIndex) => {
    const h = findHeader(sheet.name, sheet.rows)
    if (h < 0) {
      // No language columns: an information sheet of label/value pairs.
      for (const r of sheet.rows) {
        const label = cellText(r, 1).trim()
        if (label) info.push({ label, value: cellText(r, 2).trim() })
      }
      return
    }
    const header = sheet.rows[h]
    const langCols: Record<Lcid, number> = {}
    const languages: Lcid[] = []
    let firstLang = Infinity
    for (const c of header.cells) {
      if (isLcid(c.text)) {
        const lcid = Number(c.text.trim())
        if (langCols[lcid] === undefined) {
          langCols[lcid] = c.col
          languages.push(lcid)
          if (!order.includes(lcid)) order.push(lcid)
        }
        firstLang = Math.min(firstLang, c.col)
      }
    }
    const keyColumns: string[] = []
    for (let col = 1; col < firstLang; col++) keyColumns.push(cellText(header, col).trim())
    columnsBySheet[sheetIndex] = langCols

    const idx = (name: string) => keyColumns.findIndex((k) => norm(k) === norm(name))
    // Matched case-insensitively: the real export writes "Entity name" / "Object ID".
    const typeCol = idx('Entity Name')
    const idCol = idx('Object Id')
    const columnCol = idx('Object Column Name')
    const structured = typeCol >= 0 && idCol >= 0 && columnCol >= 0

    let count = 0
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r]
      const keys = keyColumns.map((_, i) => cellText(row, i + 1))
      if (keys.every((k) => k.trim() === '')) continue
      const original: Record<Lcid, string> = {}
      for (const lcid of languages) original[lcid] = cellText(row, langCols[lcid])
      let key = `${sheet.name}|${keys.join('|')}`
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      if (n > 1) key += `#${n}`
      const type = structured ? keys[typeCol] : ''
      rows.push({
        key,
        sheet: sheet.name,
        keys,
        type,
        objectId: structured ? keys[idCol].replace(/[{}]/g, '').toLowerCase() : '',
        column: structured ? keys[columnCol] : keys.filter(Boolean).join(' / '),
        kind: 'other',
        original,
        values: original,
        loc: { sheet: sheetIndex, row: r },
      })
      count++
    }
    sheets.push({ name: sheet.name, keyColumns, languages, rowCount: count })
  })

  if (sheets.length === 0) throw new Error('Die Datei enthält kein Blatt mit Sprachspalten (z. B. „Localized Labels“).')
  // Kinds need the whole file: a `Description` is a table label when the same
  // object id also carries the table name.
  const tableIds = new Set(rows.filter((r) => r.column === 'LocalizedName' || r.column === 'LocalizedCollectionName').map((r) => r.objectId))
  for (const r of rows) r.kind = r.objectId ? componentKind(r.type, r.column, tableIds.has(r.objectId)) : 'other'
  const baseLanguage = options.baseLanguage ?? baseFromInfo(info) ?? order[0]
  const languages = [baseLanguage, ...order.filter((l) => l !== baseLanguage)]
  return { xml, baseLanguage, languages, info, sheets, rows, layout, columnsBySheet }
}

export interface ApplyResult {
  file: TranslationFile
  /** Cells that now differ from the export. */
  changes: CellChange[]
  skipped: { edit: CellEdit; reason: string }[]
}

/**
 * Applies edits to the exported texts. Later edits of the same cell win. An
 * edit equal to the exported text is no change. Never writes the base
 * language, never empties a cell (whether an empty cell clears a label on
 * import is unverified), never exceeds the import's 500-character limit.
 */
export function applyEdits(file: TranslationFile, edits: CellEdit[]): ApplyResult {
  const byKey = new Map(file.rows.map((r, i) => [r.key, i]))
  const next = new Map<number, Record<Lcid, string>>()
  const skipped: ApplyResult['skipped'] = []

  for (const edit of edits) {
    const i = byKey.get(edit.rowKey)
    if (i === undefined) {
      skipped.push({ edit, reason: 'Zeile gibt es in diesem Export nicht.' })
      continue
    }
    const row = file.rows[i]
    if (edit.lcid === file.baseLanguage) {
      skipped.push({ edit, reason: 'Die Basissprache wird nie geschrieben.' })
      continue
    }
    if (!(edit.lcid in row.original)) {
      skipped.push({ edit, reason: `Sprache ${edit.lcid} hat in diesem Blatt keine Spalte.` })
      continue
    }
    const before = row.original[edit.lcid]
    if (edit.value.trim() === '' && before !== '') {
      skipped.push({ edit, reason: 'Eine Übersetzung leeren ist nicht vorgesehen.' })
      continue
    }
    if (edit.value.length > MAX_LABEL_LENGTH) {
      skipped.push({ edit, reason: `Länger als ${MAX_LABEL_LENGTH} Zeichen — der Import würde scheitern.` })
      continue
    }
    const values = next.get(i) ?? { ...row.original }
    values[edit.lcid] = edit.value.trim() === '' ? before : edit.value
    next.set(i, values)
  }

  const rows = next.size === 0 ? file.rows : file.rows.map((r, i) => (next.has(i) ? { ...r, values: next.get(i)! } : r))
  const result = { ...file, rows }
  return { file: result, changes: changesOf(result), skipped }
}

/** Every cell whose text differs from the export, in file order. */
export function changesOf(file: TranslationFile): CellChange[] {
  const out: CellChange[] = []
  for (const r of file.rows) {
    if (r.values === r.original) continue
    for (const lcid of file.languages) {
      const before = r.original[lcid]
      const after = r.values[lcid]
      if (after !== undefined && after !== before) out.push({ rowKey: r.key, lcid, before: before ?? '', after })
    }
  }
  return out
}

/**
 * Writes the file: the exported text with the changed cells patched in.
 * Without changes the result is the input, byte for byte.
 */
export function serializeTranslationFile(file: TranslationFile): string {
  const { xml, layout } = file
  const patches: { start: number; end: number; text: string }[] = []
  const cellName = layout.names.cell
  const dataName = layout.names.data
  const prefix = cellName.includes(':') ? cellName.slice(0, cellName.indexOf(':') + 1) : 'ss:'
  const dataEl = (text: string) => `<${dataName} ${prefix}Type="String">${encodeXmlText(text)}</${dataName}>`
  const withIndex = (cell: CellLoc, body: string) => {
    // body is the cell's text starting at `<Cell`; add ss:Index after the name.
    const at = 1 + cellName.length
    return `${body.slice(0, at)} ${prefix}Index="${cell.col}"${body.slice(at)}`
  }

  for (const r of file.rows) {
    if (r.values === r.original) continue
    const cols = file.columnsBySheet[r.loc.sheet]
    const writes = new Map<number, string>()
    for (const lcid of file.languages) {
      if (lcid === file.baseLanguage) continue
      const after = r.values[lcid]
      if (after !== undefined && after !== r.original[lcid] && cols[lcid] !== undefined) writes.set(cols[lcid], after)
    }
    if (writes.size === 0) continue
    const row = layout.sheets[r.loc.sheet].rows[r.loc.row]
    patches.push({ start: row.innerStart, end: row.innerEnd, text: rewriteRow(xml, row, writes, { cellName, prefix, dataEl, withIndex }) })
  }
  if (patches.length === 0) return xml

  patches.sort((a, b) => a.start - b.start)
  let out = ''
  let pos = 0
  for (const p of patches) {
    out += xml.slice(pos, p.start) + p.text
    pos = p.end
  }
  return out + xml.slice(pos)
}

interface Writer {
  cellName: string
  prefix: string
  dataEl: (text: string) => string
  withIndex: (cell: CellLoc, body: string) => string
}

/** Inner text of a row with `writes` (column → text) applied; untouched cells stay verbatim. */
function rewriteRow(xml: string, row: RowLoc, writes: Map<number, string>, w: Writer): string {
  const inserts = [...writes.keys()].filter((col) => !row.cells.some((c) => col >= c.col && col <= c.lastCol)).sort((a, b) => a - b)
  let out = ''
  let pos = row.innerStart
  let prevLast = 0
  let i = 0
  const emitInsert = (col: number) => {
    const index = col === prevLast + 1 ? '' : ` ${w.prefix}Index="${col}"`
    out += `<${w.cellName}${index}>${w.dataEl(writes.get(col)!)}</${w.cellName}>`
    prevLast = col
  }

  for (const cell of row.cells) {
    if (i < inserts.length && inserts[i] < cell.col) {
      out += xml.slice(pos, cell.start)
      pos = cell.start
      while (i < inserts.length && inserts[i] < cell.col) emitInsert(inserts[i++])
    }
    out += xml.slice(pos, cell.start)
    let body = writes.has(cell.col) ? patchCell(xml, cell, writes.get(cell.col)!, w) : xml.slice(cell.start, cell.end)
    // A cell that followed its predecessor implicitly needs an explicit index once something was inserted before it.
    if (!cell.explicitIndex && cell.col !== prevLast + 1) body = w.withIndex(cell, body)
    out += body
    pos = cell.end
    prevLast = cell.lastCol
  }
  out += xml.slice(pos, row.innerEnd)
  while (i < inserts.length) emitInsert(inserts[i++])
  return out
}

function patchCell(xml: string, cell: CellLoc, text: string, w: Writer): string {
  const d = cell.data
  if (d) {
    const openTag = xml.slice(d.start, d.selfClosing ? d.end : d.innerStart)
    const isString = !d.selfClosing && (attributes(openTag.replace(/^<[^\s>/]+/, '').replace(/\/?>$/, '')).Type ?? 'String') === 'String'
    const replacement = isString ? openTag + encodeXmlText(text) + xml.slice(d.innerEnd, d.end) : w.dataEl(text)
    return xml.slice(cell.start, d.start) + replacement + xml.slice(d.end, cell.end)
  }
  if (cell.selfClosing) {
    const open = xml.slice(cell.start, cell.end).replace(/\s*\/>$/, '>')
    return `${open}${w.dataEl(text)}</${w.cellName}>`
  }
  return xml.slice(cell.start, cell.openEnd) + w.dataEl(text) + xml.slice(cell.openEnd, cell.end)
}
