import type {
  ImportFailureItem,
  ImportJobStatus,
  ImportLogDetail,
  MissingDependencyRow,
} from '../types/importHistory'

/**
 * Parser for the `importjob.data` XML (the annotated solution manifest the
 * platform writes during an import). Pure over the XML string — unit-tested.
 *
 * The interesting bits:
 * - `<solutionManifest>` → UniqueName / Version and the manifest-level
 *   `<result result="failure" errortext="…">` verdict,
 * - `<MissingDependencies><MissingDependency>` → one row per unresolved
 *   dependency, each carrying a `<Required …>` (the component missing in the
 *   target) and a `<Dependent …>` (the imported component that needs it),
 * - every other `<result result="failure|warning">` node → generic issues.
 */

/** componenttype → readable label (dependency tables report the code). */
const TYPE_LABELS: Record<number, string> = {
  1: 'Table',
  2: 'Column',
  3: 'Relationship',
  9: 'Choice',
  10: 'Table Relationship',
  14: 'Key',
  20: 'Security Role',
  24: 'Form',
  26: 'View',
  29: 'Process',
  31: 'Report',
  48: 'Ribbon',
  59: 'Chart',
  60: 'Form',
  61: 'Web Resource',
  62: 'Site Map',
  66: 'Custom Control',
  70: 'Field Security Profile',
  80: 'Model-driven App',
  91: 'Plugin Assembly',
  92: 'Plugin Step',
  95: 'Service Endpoint',
  150: 'Routing Rule',
  300: 'Canvas App',
  371: 'Connector',
  372: 'Connector',
  380: 'Environment Variable Definition',
  381: 'Environment Variable Value',
  10064: 'Connection Reference',
}

export function componentTypeLabel(code: number | null): string {
  if (code === null) return ''
  return TYPE_LABELS[code] ?? `Type ${code}`
}

function attr(el: Element | null, name: string): string {
  return el?.getAttribute(name) ?? ''
}

function typeCode(el: Element | null): number | null {
  const raw = attr(el, 'type')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Best-effort context for a generic result node: walk up to a named parent. */
function resultContext(result: Element): string {
  let node: Element | null = result.parentElement
  for (let hops = 0; node && hops < 4; hops++) {
    const name =
      attr(node, 'localizedName') ||
      attr(node, 'LocalizedName') ||
      attr(node, 'name') ||
      attr(node, 'id')
    if (name) return `${node.tagName}: ${name}`
    if (node.tagName && node.tagName !== 'results')
      return node.tagName
    node = node.parentElement
  }
  return ''
}

function parseMissingDependency(el: Element): MissingDependencyRow {
  const required = el.querySelector('Required')
  const dependent = el.querySelector('Dependent')
  const requiredType = typeCode(required)
  const dependentType = typeCode(dependent)
  const parentSchema = attr(dependent, 'parentSchemaName')
  const parentDisplay = attr(dependent, 'parentDisplayName')
  return {
    requiredTypeCode: requiredType,
    requiredTypeLabel: componentTypeLabel(requiredType),
    requiredSchemaName: attr(required, 'schemaName'),
    requiredDisplayName: attr(required, 'displayName'),
    requiredSolution: attr(required, 'solution'),
    dependentTypeCode: dependentType,
    dependentTypeLabel: componentTypeLabel(dependentType),
    dependentSchemaName: attr(dependent, 'schemaName'),
    dependentDisplayName: attr(dependent, 'displayName'),
    dependentParent: parentDisplay || parentSchema,
  }
}

/**
 * Parse one import-log XML. Never throws on malformed input — a parse error
 * yields an 'unknown' detail with the raw problem in `topErrorText`.
 */
export function parseImportLog(xml: string): ImportLogDetail {
  const empty: ImportLogDetail = {
    solutionUniqueName: '',
    solutionVersion: '',
    status: 'unknown',
    topErrorText: '',
    missingDependencies: [],
    failures: [],
  }
  if (!xml.trim()) return empty
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'text/xml')
  } catch (err) {
    return {
      ...empty,
      topErrorText: `Could not parse the import log: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (doc.querySelector('parsererror'))
    return { ...empty, topErrorText: 'Could not parse the import log XML.' }

  // Manifest basics + overall verdict.
  const manifest = doc.querySelector('solutionManifest')
  const uniqueName =
    manifest?.querySelector('UniqueName')?.textContent?.trim() ?? ''
  const version = manifest?.querySelector('Version')?.textContent?.trim() ?? ''
  // The manifest's own result node is a DIRECT child (deeper ones belong to
  // components).
  let manifestResult: Element | null = null
  for (const child of manifest ? [...manifest.children] : [])
    if (child.tagName === 'result') manifestResult = child

  // Missing dependencies.
  const missingDependencies = [
    ...doc.querySelectorAll('MissingDependency'),
  ].map(parseMissingDependency)

  // Generic failures/warnings (excluding the manifest verdict itself).
  const failures: ImportFailureItem[] = []
  for (const result of doc.querySelectorAll(
    'result[result="failure"], result[result="warning"]',
  )) {
    if (result === manifestResult) continue
    const errorText = attr(result, 'errortext').trim()
    const errorCode = attr(result, 'errorcode').trim()
    if (!errorText && !errorCode) continue
    failures.push({
      severity:
        attr(result, 'result') === 'warning' ? 'warning' : 'failure',
      errorCode,
      errorText,
      context: resultContext(result),
    })
  }
  // Failures first, then warnings; drop exact duplicates (the platform
  // repeats the same error on several nodes).
  const seen = new Set<string>()
  const deduped = failures
    .sort((a, b) => a.severity.localeCompare(b.severity))
    .filter((f) => {
      const key = `${f.severity}|${f.errorCode}|${f.errorText}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  const manifestVerdict = attr(manifestResult, 'result')
  const status: ImportJobStatus =
    manifestVerdict === 'failure' ||
    missingDependencies.length > 0 ||
    deduped.some((f) => f.severity === 'failure')
      ? 'failed'
      : manifestVerdict === 'success'
        ? 'succeeded'
        : 'unknown'

  return {
    solutionUniqueName: uniqueName,
    solutionVersion: version,
    status,
    topErrorText: attr(manifestResult, 'errortext').trim(),
    missingDependencies,
    failures: deduped,
  }
}

/** List-level status heuristic when the log hasn't been parsed yet. */
export function importJobStatusHeuristic(
  progress: number,
  completedOn: string,
  startedOn: string,
): ImportJobStatus {
  if (progress >= 100) return 'succeeded'
  if (completedOn) return 'failed'
  if (startedOn) return 'running'
  return 'unknown'
}
