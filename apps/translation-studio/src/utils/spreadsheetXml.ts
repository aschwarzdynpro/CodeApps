/**
 * Minimal reader for Excel 2003 XML (SpreadsheetML) — the format of
 * `CrmTranslations.xml`. It records where every worksheet, row, cell and
 * `<Data>` element sits in the original text, so a writer can patch single
 * cells and leave every other byte untouched (the roundtrip guarantee).
 *
 * Deliberately not DOMParser: a DOM round trip re-serialises the whole file
 * (entities, namespace declarations, empty elements) and can't say where a
 * cell was. SpreadsheetML is regular enough for a tag scanner.
 */

export interface DataLoc {
  /** Offsets of the whole `<Data …>…</Data>` (or `<Data …/>`) element. */
  start: number
  end: number
  /** Inner content range; equal for a self-closing element. */
  innerStart: number
  innerEnd: number
  selfClosing: boolean
  /** Contains markup (rich text written by Excel) rather than plain text. */
  rich: boolean
}

export interface CellLoc {
  /** 1-based column, honouring `ss:Index` and `ss:MergeAcross`. */
  col: number
  /** Last column the cell covers (`col` unless merged). */
  lastCol: number
  start: number
  end: number
  /** End of the opening tag (after `>`). */
  openEnd: number
  selfClosing: boolean
  explicitIndex: boolean
  data: DataLoc | null
  /** Decoded text content ('' when empty). */
  text: string
}

export interface RowLoc {
  start: number
  end: number
  /** Content range between `<Row …>` and `</Row>`; equal for `<Row/>`. */
  innerStart: number
  innerEnd: number
  cells: CellLoc[]
}

export interface SheetLoc {
  name: string
  start: number
  end: number
  rows: RowLoc[]
}

export interface WorkbookLoc {
  sheets: SheetLoc[]
  /** Element names as written in the file (`Data` or `ss:Data`, …). */
  names: { cell: string; data: string }
}

const TAG =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)((?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*))((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** Attributes by local name (prefix dropped: `ss:Index` → `Index`). */
export function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(ATTR)) {
    const name = m[1].includes(':') ? m[1].slice(m[1].indexOf(':') + 1) : m[1]
    out[name] = decodeXml(m[2] ?? m[3] ?? '')
  }
  return out
}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

export function decodeXml(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (all, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref] ?? all
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : all
  })
}

/**
 * Escapes text for element content. Line breaks become `&#10;` as Excel
 * writes them; characters XML 1.0 forbids are dropped.
 */
export function encodeXmlText(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\n|\r/g, '&#10;')
}

/** Escapes text for a double-quoted attribute value. */
export function encodeXmlAttr(s: string): string {
  return encodeXmlText(s).replace(/"/g, '&quot;')
}

/** Scans a SpreadsheetML workbook. Throws on text that is not one. */
export function scanWorkbook(xml: string): WorkbookLoc {
  const sheets: SheetLoc[] = []
  const names = { cell: 'Cell', data: 'Data' }
  let sheet: SheetLoc | null = null
  let row: RowLoc | null = null
  let cell: CellLoc | null = null
  let nextCol = 1
  let data: { start: number; innerStart: number; depth: number; rich: boolean; text: string } | null = null
  let sawWorkbook = false

  TAG.lastIndex = 0
  let last = 0
  for (let m = TAG.exec(xml); m; m = TAG.exec(xml)) {
    const text = xml.slice(last, m.index)
    last = TAG.lastIndex
    if (data && text) data.text += text
    const local = m[3]
    if (!local) {
      // Comment / CDATA / processing instruction. CDATA inside Data is text.
      if (data && m[0].startsWith('<![CDATA[')) data.text += m[0].slice(9, -3)
      continue
    }
    const closing = m[1] === '/'
    const selfClosing = m[5] === '/'
    const start = m.index
    const end = TAG.lastIndex

    if (data) {
      if (local === 'Data' && closing && data.depth === 0) {
        const loc: DataLoc = { start: data.start, end, innerStart: data.innerStart, innerEnd: start, selfClosing: false, rich: data.rich }
        if (cell) {
          cell.data = loc
          cell.text = decodeXml(data.text)
        }
        data = null
      } else {
        // Rich text (<Font>, <B> …) inside Data: keep the text, note the markup.
        data.rich = true
        if (!selfClosing) data.depth += closing ? -1 : 1
      }
      continue
    }

    switch (local) {
      case 'Workbook':
        sawWorkbook = true
        break
      case 'Worksheet':
        if (closing) {
          if (sheet) {
            sheet.end = end
            sheets.push(sheet)
          }
          sheet = null
        } else {
          sheet = { name: attributes(m[4]).Name ?? `Sheet${sheets.length + 1}`, start, end, rows: [] }
          if (selfClosing) {
            sheets.push(sheet)
            sheet = null
          }
        }
        break
      case 'Row':
        if (!sheet) break
        if (closing) {
          if (row) {
            row.innerEnd = start
            row.end = end
            sheet.rows.push(row)
          }
          row = null
        } else {
          row = { start, end, innerStart: end, innerEnd: end, cells: [] }
          nextCol = 1
          if (selfClosing) {
            sheet.rows.push(row)
            row = null
          }
        }
        break
      case 'Cell':
        if (!row) break
        if (closing) {
          if (cell) {
            cell.end = end
            row.cells.push(cell)
          }
          cell = null
        } else {
          names.cell = m[2]
          const a = attributes(m[4])
          const index = a.Index ? parseInt(a.Index, 10) : NaN
          const col = Number.isFinite(index) && index > 0 ? index : nextCol
          const merge = a.MergeAcross ? parseInt(a.MergeAcross, 10) || 0 : 0
          cell = { col, lastCol: col + merge, start, end, openEnd: end, selfClosing, explicitIndex: Number.isFinite(index), data: null, text: '' }
          nextCol = col + merge + 1
          if (selfClosing) {
            row.cells.push(cell)
            cell = null
          }
        }
        break
      case 'Data':
        if (!cell || closing) break
        names.data = m[2]
        if (selfClosing) cell.data = { start, end, innerStart: end, innerEnd: end, selfClosing: true, rich: false }
        else data = { start, innerStart: end, depth: 0, rich: false, text: '' }
        break
    }
  }
  if (!sawWorkbook) throw new Error('Keine SpreadsheetML-Arbeitsmappe (Element <Workbook> fehlt).')
  if (data || cell || row || sheet) throw new Error('Arbeitsmappe ist unvollständig (nicht geschlossenes Element).')
  return { sheets, names }
}
