import type { ImportJobState } from '../types/translation'
import { attributes } from './spreadsheetXml'

/**
 * `importjob.data` after a translation import. Its format for translations
 * is not documented (README „Offen“); this reads what solution imports use:
 * elements carrying `result="failure|warning"` plus `errortext`/`errorcode`.
 * Anything else stays available as the raw log.
 */

export type ImportStatus = 'running' | 'succeeded' | 'failed'

export interface LogEntry {
  level: 'failure' | 'warning'
  text: string
  /** Element and identifying attributes, e.g. `entity pro_vehicle`. */
  context: string
}

/** Same heuristic as the import history in solution-forge: 100 % = done; completed below 100 = failed. */
export function importStatus(job: Pick<ImportJobState, 'progress' | 'completedOn'>): ImportStatus {
  if (job.progress >= 100) return 'succeeded'
  return job.completedOn ? 'failed' : 'running'
}

const ELEMENT = /<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g

export function parseImportLog(data: string | null): LogEntry[] {
  if (!data) return []
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
