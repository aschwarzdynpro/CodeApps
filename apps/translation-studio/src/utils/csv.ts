import type { CellEdit, ComponentInfo, LabelRow, Lcid, TranslationFile } from '../types/translation'
import { languageName } from './languages'

/**
 * CSV roundtrip for the business side: export the chosen labels with a stable
 * key per row, read the filled file back as edits. Semicolon, UTF-8 with BOM
 * and CRLF — what Excel with German settings opens and saves without asking.
 * Reading accepts `;`, `,` and tab.
 */

export const KEY_HEADER = 'Schlüssel'
const BASE_SUFFIX = ' Basis (nicht ändern)'

/** Spreadsheet formula prefixes; such texts get a leading `'` on export. */
const FORMULA = /^[=+\-@]/

function quote(field: string, delimiter: string): string {
  const v = FORMULA.test(field) ? `'${field}` : field
  return /["\r\n]/.test(v) || v.includes(delimiter) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v
}

export interface CsvExportOptions {
  languages: Lcid[]
  components?: ReadonlyMap<string, ComponentInfo>
  delimiter?: string
}

export function exportCsv(file: TranslationFile, rows: LabelRow[], options: CsvExportOptions): string {
  const d = options.delimiter ?? ';'
  const targets = options.languages.filter((l) => l !== file.baseLanguage)
  const header = [
    KEY_HEADER,
    'Blatt',
    'Typ',
    'Objekt-ID',
    'Spalte',
    'Tabelle',
    `${file.baseLanguage}${BASE_SUFFIX}`,
    ...targets.map((l) => `${l} ${languageName(l)}`),
  ]
  const lines = [header.map((h) => quote(h, d)).join(d)]
  for (const r of rows) {
    const c = options.components?.get(r.objectId)
    const fields = [r.key, r.sheet, r.type, r.objectId, r.column, c?.table ?? '', r.values[file.baseLanguage] ?? '', ...targets.map((l) => r.values[l] ?? '')]
    lines.push(fields.map((f) => quote(f, d)).join(d))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** RFC 4180 parser; the delimiter is taken from the header line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const d = [';', '\t', ','].map((c) => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === d) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f !== ''))
}

const unformula = (v: string) => (v.startsWith("'") && FORMULA.test(v.slice(1)) ? v.slice(1) : v)

export interface CsvReadResult {
  edits: CellEdit[]
  /** Data rows in the file. */
  rowsRead: number
  /** Languages the file has columns for (without the base language). */
  languages: Lcid[]
  issues: string[]
}

/**
 * Edits from a filled CSV: every non-empty cell that differs from the current
 * text. Empty cells mean "no change". The base-language column is ignored.
 */
export function csvToEdits(text: string, file: TranslationFile): CsvReadResult {
  const table = parseCsv(text)
  const issues: string[] = []
  if (table.length === 0) return { edits: [], rowsRead: 0, languages: [], issues: ['Die Datei ist leer.'] }
  const header = table[0].map((h) => h.trim())
  const keyCol = header.findIndex((h) => h === KEY_HEADER || h.toLowerCase() === 'key')
  if (keyCol < 0) return { edits: [], rowsRead: 0, languages: [], issues: [`Spalte „${KEY_HEADER}“ fehlt — bitte eine aus dem Studio exportierte Datei verwenden.`] }

  const langCols: { lcid: Lcid; col: number }[] = []
  let baseCol = -1
  header.forEach((h, col) => {
    const m = /^(\d{4,5})(\b|$)/.exec(h)
    if (!m) return
    const lcid = Number(m[1])
    if (lcid === file.baseLanguage) baseCol = col
    else if (file.languages.includes(lcid)) langCols.push({ lcid, col })
    else issues.push(`Spalte „${h}“: Sprache ${lcid} ist in der Umgebung nicht installiert — ignoriert.`)
  })
  if (langCols.length === 0) issues.push('Keine Spalte mit einer Zielsprache gefunden.')

  const rows = new Map(file.rows.map((r) => [r.key, r]))
  const edits: CellEdit[] = []
  let unknown = 0
  let baseChanged = 0
  for (const line of table.slice(1)) {
    const key = line[keyCol] ?? ''
    const row = rows.get(key)
    if (!row) {
      unknown++
      continue
    }
    if (baseCol >= 0 && unformula(line[baseCol] ?? '') !== (row.values[file.baseLanguage] ?? '')) baseChanged++
    for (const { lcid, col } of langCols) {
      const value = unformula(line[col] ?? '')
      if (value.trim() === '' || !(lcid in row.original) || value === row.values[lcid]) continue
      edits.push({ rowKey: key, lcid, value })
    }
  }
  if (unknown > 0) issues.push(`${unknown} Zeile${unknown === 1 ? '' : 'n'} mit unbekanntem Schlüssel (anderer Export oder andere Solution) — übersprungen.`)
  if (baseChanged > 0) issues.push(`${baseChanged} Änderung${baseChanged === 1 ? '' : 'en'} in der Basissprache — ignoriert, die Basissprache wird nie geschrieben.`)
  return { edits, rowsRead: table.length - 1, languages: langCols.map((c) => c.lcid), issues }
}
