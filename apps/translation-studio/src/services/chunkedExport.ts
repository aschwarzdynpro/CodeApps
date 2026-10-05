import { mergeTranslationXml, type ExtraLabel } from '../utils/mergeTranslations'

/**
 * Export of a solution too large for one `ExportTranslation` call (the Power
 * Apps host ends every call after 180 s; WaldmannCore took 195–304 s).
 *
 * The solution's components go into temporary unmanaged solutions
 * (`tsexport_<run>_<n>`, same publisher), each part is exported on its own —
 * in parallel — and the files are merged into one that reads like a single
 * export. The temporary solutions are deleted afterwards; the components
 * themselves are never touched. Findings from Waldmann DEV COPY (2026-10-05):
 *
 * - `ExportTranslation` exports all labels of a table no matter which of its
 *   subcomponents the solution lists, so a table goes in as a bare root
 *   (one call instead of hundreds).
 * - Apart from tables only a few component types carry labels in the file:
 *   option sets, dashboards, site maps, custom APIs, processes, apps. Others
 *   (security roles, connection roles, plug-ins …) carry none and drag whole
 *   tables in; app actions (`appaction`) drag ~200 tables, so their labels are
 *   read with `RetrieveLocLabels` instead.
 * - Deleting a solution is an uninstall: one at a time (else 429).
 */

export interface ChunkComponent {
  /** `componenttype` */
  type: number
  /** `objectid` */
  id: string
}

export interface ChunkPlan {
  /** One list per temporary solution. */
  parts: ChunkComponent[][]
  /** `appaction` components: labels read directly. */
  actions: ChunkComponent[]
}

export const TABLES_PER_PART = 20
const TABLE = 1
const APP_ACTION = 10205
/** Non-table components with labels, grouped so that the ones dragging tables (processes, apps) don't slow the rest. */
const LABEL_GROUPS = [[9, 60, 62, 10027], [29], [80]]
/** Columns of `appaction` with labels in the translation file. */
export const APP_ACTION_COLUMNS = ['buttonlabeltext', 'buttontooltiptitle', 'buttontooltipdescription', 'buttonaccessibilitytext']

export function planChunks(roots: ChunkComponent[], tablesPerPart = TABLES_PER_PART): ChunkPlan {
  const tables = roots.filter((c) => c.type === TABLE)
  const parts: ChunkComponent[][] = []
  for (let i = 0; i < tables.length; i += tablesPerPart) parts.push(tables.slice(i, i + tablesPerPart))
  for (const group of LABEL_GROUPS) {
    const items = roots.filter((c) => group.includes(c.type))
    if (items.length > 0) parts.push(items)
  }
  return { parts, actions: roots.filter((c) => c.type === APP_ACTION) }
}

export interface ChunkDeps {
  solution(uniqueName: string): Promise<{ id: string; publisherId: string; friendlyName: string }>
  /** Root components (`rootsolutioncomponentid` empty). */
  rootComponents(solutionId: string): Promise<ChunkComponent[]>
  /** Logical name per table `MetadataId` (lower case), for every table of the environment. */
  tables(): Promise<Map<string, string>>
  createSolution(uniqueName: string, publisherId: string): Promise<string>
  addComponent(uniqueName: string, c: ChunkComponent, withoutSubcomponents: boolean): Promise<void>
  /** `CrmTranslations.xml` of a solution. */
  exportXml(uniqueName: string): Promise<string>
  deleteSolution(id: string): Promise<void>
  /** Temporary solutions of earlier runs that were left behind (closed tab), older than a few hours. */
  staleSolutions(): Promise<string[]>
  /** Labels of a localizable column per LCID (`RetrieveLocLabels`). */
  labels(entitySet: string, id: string, column: string): Promise<Record<number, string>>
}

export interface ChunkProgress {
  step: 'prepare' | 'add' | 'export' | 'merge'
  done: number
  total: number
}

export interface ChunkOptions {
  onProgress?: (p: ChunkProgress) => void
  parallel?: number
  newRunId?: () => string
  sleep?: (ms: number) => Promise<void>
}

export interface ChunkResult {
  xml: string
  parts: number
  /** Notes for the user (components that couldn't be split off, labels not read). */
  warnings: string[]
  /** Deleting the temporary solutions (runs on after the result; one at a time). */
  cleanup: Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
/** Deadlocks while adding in parallel, throttling, an uninstall still running. */
const TRANSIENT = /\b1205\b|deadlock|0x80044150|\b429\b|\b503\b|0x80071151|too many requests|another \[uninstall\]/i

async function pool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function persist<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>, tries: number, pauseMs: number): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= tries || !TRANSIENT.test(message(err))) throw err
      await sleep(pauseMs * Math.min(attempt, 4))
    }
  }
}

export async function exportInParts(solutionName: string, deps: ChunkDeps, o: ChunkOptions = {}): Promise<ChunkResult> {
  const sleep = o.sleep ?? defaultSleep
  const parallel = o.parallel ?? 4
  const progress = (step: ChunkProgress['step'], done: number, total: number) => o.onProgress?.({ step, done, total })
  const warnings: string[] = []

  progress('prepare', 0, 1)
  const solution = await deps.solution(solutionName)
  const [roots, tables, stale] = await Promise.all([
    deps.rootComponents(solution.id),
    deps.tables(),
    deps.staleSolutions().catch(() => [] as string[]),
  ])
  const plan = planChunks(roots)
  const ownTables = new Set(roots.filter((c) => c.type === TABLE).map((c) => tables.get(c.id.toLowerCase())).filter((n): n is string => !!n))
  const allTables = new Set(tables.values())

  const run = (o.newRunId ?? (() => Math.random().toString(36).slice(2, 8)))()
  const created: string[] = []
  const cleanup = (): Promise<void> =>
    (async () => {
      // Uninstalls run one at a time; left-overs of earlier runs go with them.
      for (const id of [...created, ...stale]) {
        try {
          await persist(() => deps.deleteSolution(id), sleep, 40, 1500)
        } catch (err) {
          console.warn('[translation] temporary solution not deleted', id, err)
        }
      }
    })()

  try {
    const names = plan.parts.map((_, i) => `tsexport_${run}_${i}`)
    await pool(names, parallel, async (name) => {
      created.push(await deps.createSolution(name, solution.publisherId))
    })

    // Bare tables; the rest with its subcomponents, or bare when that fails (a custom API whose plug-in can't be added).
    const items = plan.parts.flatMap((part, i) => part.map((c) => ({ c, name: names[i] })))
    let added = 0
    const failed = new Map<number, number>()
    progress('add', 0, items.length)
    await pool(items, parallel, async ({ c, name }) => {
      const add = (bare: boolean) => persist(() => deps.addComponent(name, c, bare), sleep, 6, 700)
      try {
        await add(c.type === TABLE)
      } catch (err) {
        try {
          if (c.type === TABLE) throw err
          await add(true)
        } catch (again) {
          failed.set(c.type, (failed.get(c.type) ?? 0) + 1)
          console.warn('[translation] component not split off', c, again)
        }
      }
      progress('add', ++added, items.length)
    })
    if (failed.size > 0) warnings.push(`${[...failed.values()].reduce((a, b) => a + b, 0)} Komponente(n) ließen sich nicht aufteilen (Typ ${[...failed.keys()].join(', ')}) — ihre Beschriftungen fehlen.`)

    const xmls = new Array<string>(names.length)
    let exported = 0
    progress('export', 0, names.length)
    await pool(names, parallel, async (name, i) => {
      xmls[i] = await deps.exportXml(name)
      progress('export', ++exported, names.length)
    })

    // Labels no part carries: app actions, the solution's own name.
    progress('merge', 0, 1)
    const extra: ExtraLabel[] = []
    let missingActions = 0
    await pool(plan.actions, parallel, async (a) => {
      for (const column of APP_ACTION_COLUMNS) {
        try {
          const texts = await deps.labels('appactions', a.id, column)
          if (Object.values(texts).some((t) => t)) extra.push({ group: 'appaction', objectId: a.id, column, texts })
        } catch (err) {
          missingActions++
          console.warn('[translation] app action labels not readable', a.id, column, err)
        }
      }
    })
    if (missingActions > 0) warnings.push(`Beschriftungen von Befehlsleisten-Aktionen (appaction) nicht vollständig lesbar — ${missingActions} Abfrage(n) fehlgeschlagen.`)
    try {
      const texts = await deps.labels('solutions', solution.id, 'friendlyname')
      if (Object.values(texts).some((t) => t)) extra.push({ group: 'Solution', objectId: solution.id, column: 'friendlyname', texts })
    } catch {
      // The solution's display name only — not worth a warning.
    }

    const xml = mergeTranslationXml(xmls, {
      // Tables dragged in by processes or apps aren't part of the solution; the parts' own solution rows neither.
      keep: (_, [group]) => group !== 'Solution' && (!allTables.has(group) || ownTables.has(group)),
      extra,
      solutionName,
    })
    progress('merge', 1, 1)
    return { xml, parts: names.length, warnings, cleanup: cleanup() }
  } catch (err) {
    void cleanup()
    throw err
  }
}
