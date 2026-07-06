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

/**
 * The `type` on a Required/Dependent node is usually a numeric componenttype,
 * but real logs also use the logical-name string (e.g. "connectionreference").
 * Resolve either to a code (when known) and a readable label.
 */
const TYPE_NAME_LABELS: Record<string, { code: number | null; label: string }> =
  {
    entity: { code: 1, label: 'Table' },
    attribute: { code: 2, label: 'Column' },
    optionset: { code: 9, label: 'Choice' },
    role: { code: 20, label: 'Security Role' },
    savedquery: { code: 26, label: 'View' },
    workflow: { code: 29, label: 'Process' },
    systemform: { code: 60, label: 'Form' },
    webresource: { code: 61, label: 'Web Resource' },
    pluginassembly: { code: 91, label: 'Plugin Assembly' },
    sdkmessageprocessingstep: { code: 92, label: 'Plugin Step' },
    canvasapp: { code: 300, label: 'Canvas App' },
    environmentvariabledefinition: {
      code: 380,
      label: 'Environment Variable Definition',
    },
    environmentvariablevalue: {
      code: 381,
      label: 'Environment Variable Value',
    },
    connectionreference: { code: 10064, label: 'Connection Reference' },
  }

function resolveType(el: Element | null): { code: number | null; label: string } {
  const raw = attr(el, 'type').trim()
  if (!raw) return { code: null, label: '' }
  const n = Number(raw)
  if (Number.isFinite(n)) return { code: n, label: componentTypeLabel(n) }
  const known = TYPE_NAME_LABELS[raw.toLowerCase()]
  if (known) return known
  return { code: null, label: raw.charAt(0).toUpperCase() + raw.slice(1) }
}

/**
 * Schema/logical name of a Required/Dependent node. Logs vary: some carry
 * `schemaName`, others an `id.<something>name` attribute (e.g.
 * `id.connectionreferencelogicalname`). The bare `id` is a GUID, not a name.
 */
function idQualifiedName(el: Element | null): string {
  if (!el) return ''
  for (const a of [...el.attributes])
    if (a.name.length > 3 && a.name.toLowerCase().startsWith('id.')) return a.value
  return ''
}
function schemaName(el: Element | null): string {
  return attr(el, 'schemaName') || idQualifiedName(el)
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
  const rt = resolveType(required)
  const dt = resolveType(dependent)
  const parentSchema = attr(dependent, 'parentSchemaName')
  const parentDisplay = attr(dependent, 'parentDisplayName')
  return {
    requiredTypeCode: rt.code,
    requiredTypeLabel: rt.label,
    requiredSchemaName: schemaName(required),
    requiredDisplayName: attr(required, 'displayName'),
    requiredSolution: attr(required, 'solution'),
    dependentTypeCode: dt.code,
    dependentTypeLabel: dt.label,
    dependentSchemaName: schemaName(dependent),
    dependentDisplayName: attr(dependent, 'displayName'),
    dependentParent: parentDisplay || parentSchema,
  }
}

/**
 * The platform frequently reports missing dependencies NOT as their own
 * `<MissingDependency>` elements but embedded — as escaped XML — inside the
 * manifest's `errortext` (e.g. "…missing dependencies are : &lt;Missing
 * Dependencies&gt;…"). Pull that block out of a message and parse the rows.
 * Returns [] when there is no block or it will not re-parse (the caller then
 * keeps the raw message so nothing is lost).
 */
function extractEmbeddedMissingDeps(text: string): MissingDependencyRow[] {
  if (!text || !/<MissingDependency\b/i.test(text)) return []
  const block = text.match(/<MissingDependencies[\s\S]*<\/MissingDependencies>/i)
  if (!block) return []
  try {
    const frag = new DOMParser().parseFromString(block[0], 'text/xml')
    if (frag.querySelector('parsererror')) return []
    return [...frag.querySelectorAll('MissingDependency')].map(
      parseMissingDependency,
    )
  } catch {
    return []
  }
}

/** Cut an embedded MissingDependencies block off a message, leaving a readable
 *  lead-in (the parsed rows render as a table). */
function stripEmbeddedXml(text: string): string {
  const cut = text.search(/<MissingDependencies/i)
  return (cut < 0 ? text : text.slice(0, cut)).replace(/\s+$/, '').trim()
}

const depKey = (d: MissingDependencyRow): string =>
  [
    d.requiredTypeLabel,
    d.requiredSchemaName,
    d.requiredDisplayName,
    d.requiredSolution,
    d.dependentTypeLabel,
    d.dependentSchemaName,
    d.dependentDisplayName,
    d.dependentParent,
  ].join('|')

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

  // Missing dependencies — real `<MissingDependency>` elements PLUS any block
  // embedded (escaped) inside a result's errortext / text content.
  const missingRaw = [...doc.querySelectorAll('MissingDependency')].map(
    parseMissingDependency,
  )
  for (const result of doc.querySelectorAll('result')) {
    missingRaw.push(...extractEmbeddedMissingDeps(attr(result, 'errortext')))
    missingRaw.push(...extractEmbeddedMissingDeps(result.textContent ?? ''))
  }
  const seenDep = new Set<string>()
  const missingDependencies = missingRaw.filter((d) => {
    const key = depKey(d)
    if (seenDep.has(key)) return false
    seenDep.add(key)
    return true
  })

  // Generic failures/warnings (excluding the manifest verdict itself).
  const failures: ImportFailureItem[] = []
  for (const result of doc.querySelectorAll(
    'result[result="failure"], result[result="warning"]',
  )) {
    if (result === manifestResult) continue
    const errorText = stripEmbeddedXml(attr(result, 'errortext').trim())
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

  // Strip the embedded dependency block from the headline — but only when we
  // actually parsed rows out of it, so a fragment we couldn't read stays visible.
  const manifestErrorText = attr(manifestResult, 'errortext').trim()
  const topErrorText =
    extractEmbeddedMissingDeps(manifestErrorText).length > 0
      ? stripEmbeddedXml(manifestErrorText)
      : manifestErrorText

  return {
    solutionUniqueName: uniqueName,
    solutionVersion: version,
    status,
    topErrorText,
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
