import type { ImportJobState } from '../types/translation'
import { attributes } from './spreadsheetXml'

/**
 * `importjob.data` after an import. A translation import writes (seen live in
 * Waldmann DEV COPY, 2026-10-04):
 *
 *   <importtranslations><status>Succeeded</status><errordetails>
 *     <errorcode>0</errorcode><worksheet>Localized Labels</worksheet>
 *     <rownumber>33622</rownumber></errordetails></importtranslations>
 *
 * — the row is where the import stopped (on success the last row). Solution
 * imports instead carry `result="failure|warning"` with `errortext`/`errorcode`
 * on their elements; both are read. Anything else stays the raw log.
 */

export type ImportStatus = 'running' | 'succeeded' | 'failed'

export interface LogEntry {
  level: 'failure' | 'warning'
  text: string
  /** Element and identifying attributes, e.g. `entity pro_vehicle`. */
  context: string
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim()

/** The translation import's own verdict (`<importtranslations><status>`), when the log has one. */
function translationStatus(data: string | null | undefined): ImportStatus | null {
  if (!data || !data.includes('<importtranslations')) return null
  const s = (tag(data, 'status') ?? '').toLowerCase()
  if (s === 'succeeded' || s === 'success' || s === 'completed') return 'succeeded'
  if (s === 'failed' || s === 'failure' || s === 'error') return 'failed'
  return null
}

/**
 * The log's verdict when there is one; otherwise the heuristic of the import
 * history in solution-forge: 100 % = done, completed below 100 = failed.
 */
export function importStatus(job: Pick<ImportJobState, 'progress' | 'completedOn'> & { data?: string | null }): ImportStatus {
  const own = translationStatus(job.data)
  if (own) return own
  if (job.progress >= 100) return 'succeeded'
  return job.completedOn ? 'failed' : 'running'
}

/** `-2147220891` → `0x80040265`, the form Microsoft's error reference uses. */
function errorCode(code: string): string {
  const n = Number(code)
  if (!Number.isFinite(n) || code.startsWith('0x')) return code
  return `0x${(n >>> 0).toString(16).padStart(8, '0')}`
}

/** The failure of a translation import: code and where it stopped. */
function translationFailure(data: string): LogEntry[] {
  const status = translationStatus(data)
  const code = tag(data, 'errorcode') ?? ''
  if (status !== 'failed' && (code === '' || code === '0')) return []
  const sheet = tag(data, 'worksheet')
  const row = tag(data, 'rownumber')
  const text = tag(data, 'errortext') || tag(data, 'message') || (code && code !== '0' ? `Fehlercode ${errorCode(code)}` : 'Import fehlgeschlagen (ohne Fehlertext)')
  const where = [sheet, row ? `Zeile ${row}` : ''].filter(Boolean).join(', ')
  return [{ level: 'failure', text, context: where || 'importtranslations' }]
}

const ELEMENT = /<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g

export function parseImportLog(data: string | null): LogEntry[] {
  if (!data) return []
  if (data.includes('<importtranslations')) return translationFailure(data)
  const out: LogEntry[] = []
  const stack: string[] = []
  for (const m of data.matchAll(ELEMENT)) {
    const a = attributes(m[2])
    const result = (a.result ?? '').toLowerCase()
    const name = m[1]
    if (result !== 'failure' && result !== 'warning') {
      if (a.id || a.name || a.LocalizedName) stack.push(`${name} ${a.LocalizedName ?? a.name ?? a.id}`)
      continue
    }
    const text = a.errortext || a.errorText || (a.errorcode ? `Fehlercode ${a.errorcode}` : 'ohne Fehlertext')
    const own = a.id || a.name || a.LocalizedName
    out.push({ level: result, text, context: own ? `${name} ${a.LocalizedName ?? a.name ?? a.id}` : (stack[stack.length - 1] ?? name) })
  }
  return out
}
