import type { OdataRow } from '../types/odataBrowser'
import { cellValue, rawText } from './odataFormat'

/**
 * OData Browser — exporting a result.
 *
 * CSV follows RFC 4180: fields containing a delimiter, a quote or a line break
 * are wrapped in double quotes and inner quotes are doubled. The file is
 * written with a **UTF-8 BOM**, because Excel otherwise reads it as the local
 * ANSI codepage and mangles every umlaut — the single most common complaint
 * about CSV exports from a German-language system.
 */

/** Quote a CSV field only when it actually needs it. */
export function csvField(value: string, delimiter = ','): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  if (!needsQuotes) return value
  return `"${value.replace(/"/g, '""')}"`
}

export interface CsvOptions {
  /** Use the FormattedValue annotations instead of the raw payload. */
  formatted?: boolean
  delimiter?: string
}

export function toCsv(
  rows: OdataRow[],
  keys: string[],
  options: CsvOptions = {},
): string {
  const { formatted = true, delimiter = ',' } = options
  const lines: string[] = [
    keys.map((key) => csvField(key, delimiter)).join(delimiter),
  ]
  for (const row of rows) {
    const cells = keys.map((key) => {
      const cell = cellValue(row, key)
      const text = formatted ? cell.text : rawText(cell.raw)
      return csvField(text, delimiter)
    })
    lines.push(cells.join(delimiter))
  }
  // CRLF is what RFC 4180 asks for and what Excel is happiest with.
  return lines.join('\r\n')
}

/** The rows as pretty JSON, annotations and all. */
export function toJson(rows: OdataRow[]): string {
  return JSON.stringify(rows, null, 2)
}

/** A filesystem-friendly name, e.g. `accounts-2026-07-29.csv`. */
export function exportFileName(
  table: string,
  extension: string,
  now: Date,
): string {
  const stamp = now.toISOString().slice(0, 10)
  const safe = table.replace(/[^\w.-]+/g, '_') || 'result'
  return `${safe}-${stamp}.${extension}`
}

const BOM = '﻿'

/** Trigger a browser download of a text payload. */
export function downloadText(
  fileName: string,
  mimeType: string,
  text: string,
  withBom = false,
): void {
  const blob = new Blob([withBom ? BOM + text : text], {
    type: `${mimeType};charset=utf-8`,
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
