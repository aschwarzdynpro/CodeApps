import type { Board, ConfigDetail, ViewRef } from '../types/board'
import {
  buildIdMap,
  buildPackage,
  collectRefs,
  composeContent,
  planImport,
  type BoardPackage,
  type ImportPlan,
  type PackagedConfig,
  type PackagedRecord,
  type TargetData,
} from '../utils/boardTransfer'
import { saveConfigSnapshot, saveSnapshot } from '../utils/snapshots'
import { ORG_URL } from '../config'
import type { BoardService } from './boardService'

/** Lower-cased IDs per table of the filter-value records. */
function recordsByEntity(pkg: Pick<BoardPackage, 'board'>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const r of collectRefs(pkg.board.content)) {
    if (r.kind !== 'record' || !r.entity) continue
    const list = out.get(r.entity.toLowerCase()) ?? []
    if (!list.includes(r.id)) list.push(r.id)
    out.set(r.entity.toLowerCase(), list)
  }
  return out
}

/** Board + everything it references, with names and configuration payloads. */
export async function exportBoard(svc: BoardService, board: Board): Promise<BoardPackage> {
  const refs = collectRefs(board.content)
  const ids = (kind: string) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))]

  const configs: PackagedConfig[] = await Promise.all(
    ids('config').map(async (id) => {
      try {
        const c = await svc.getConfiguration(id)
        return { id: c.id, name: c.name, type: c.type, value: c.value }
      } catch {
        // Dangling reference — exported without payload, the import offers to clear it.
        return { id, name: id, type: null, value: null }
      }
    }),
  )
  const [views, bookingSetups, timeZones] = await Promise.all([
    svc.getViewsByIds(ids('view')),
    svc.listBookingSetups(),
    svc.listTimeZones(),
  ])
  const records: PackagedRecord[] = []
  for (const [entity, recIds] of recordsByEntity({ board })) {
    const found = await svc.resolveRecords(entity, recIds.map((id) => ({ id, name: null })))
    for (const id of recIds) records.push({ id, entity, name: found?.get(id)?.name ?? null })
  }
  return buildPackage(board, {
    configs,
    views,
    bookingSetups,
    timeZones,
    records,
    orgUrl: ORG_URL || null,
    now: new Date().toISOString(),
  })
}

export interface PreparedImport {
  target: TargetData
  plan: ImportPlan
  /** Payloads of the matched target configurations, for the comparison. */
  configDetails: Map<string, ConfigDetail>
}

/** Reads what the target environment has and proposes a mapping. */
export async function prepareImport(svc: BoardService, pkg: BoardPackage): Promise<PreparedImport> {
  const viewIds = [...new Set(collectRefs(pkg.board.content).filter((r) => r.kind === 'view').map((r) => r.id))]
  const entities = [...new Set(pkg.views.map((v) => v.entity))]
  const [configs, viewsByEntity, viewsById, bookingSetups, timeZones] = await Promise.all([
    svc.listConfigurations(),
    entities.length > 0 ? svc.listViews(entities) : Promise.resolve([] as ViewRef[]),
    svc.getViewsByIds(viewIds),
    svc.listBookingSetups(),
    svc.listTimeZones(),
  ])
  const views = [...viewsByEntity, ...viewsById.filter((v) => !viewsByEntity.some((x) => x.id.toLowerCase() === v.id.toLowerCase()))]

  const records: TargetData['records'] = new Map()
  const checkedEntities = new Set<string>()
  for (const [entity, ids] of recordsByEntity(pkg)) {
    const refs = ids.map((id) => ({ id, name: pkg.records.find((r) => r.id.toLowerCase() === id)?.name ?? null }))
    const found = await svc.resolveRecords(entity, refs)
    if (!found) continue
    checkedEntities.add(entity)
    for (const [id, hit] of found) records.set(id, { id: hit.id, matchedBy: hit.matchedBy })
  }

  const target: TargetData = { configs, views, bookingSetups, timeZones, records, checkedEntities }
  const plan = planImport(pkg, target)
  const configDetails = new Map<string, ConfigDetail>()
  for (const id of new Set(plan.configs.map((c) => c.matchId).filter((x): x is string => x !== null))) {
    try {
      configDetails.set(id.toLowerCase(), await svc.getConfiguration(id))
    } catch {
      // Listed but not readable — compared as "unknown".
    }
  }
  return { target, plan, configDetails }
}

export type ImportMode =
  | { kind: 'new'; name: string; shareType: number; order: number }
  | { kind: 'replace'; board: Board }

export interface ImportResult {
  boardId: string
  createdConfigs: string[]
  updatedConfigs: string[]
}

/**
 * Writes configurations first, then the board. A failure after configuration
 * writes names them, so nothing is left behind silently.
 */
export async function runImport(
  svc: BoardService,
  pkg: BoardPackage,
  prepared: PreparedImport,
  plan: ImportPlan,
  mode: ImportMode,
  includeFilterValues: boolean,
): Promise<ImportResult> {
  const created = new Map<string, string>()
  const createdNames: string[] = []
  const updatedNames: string[] = []
  try {
    for (const c of plan.configs) {
      if (c.action === 'create') {
        if (c.source.value === null || c.source.type === null) throw new Error(`„${c.source.name}“ kann ohne Inhalt nicht angelegt werden.`)
        const id = await svc.createConfiguration(c.createName.trim() || c.source.name, c.source.type, c.source.value)
        created.set(c.source.id.toLowerCase(), id)
        createdNames.push(c.createName.trim() || c.source.name)
      } else if (c.action === 'update') {
        const original = c.matchId ? prepared.configDetails.get(c.matchId.toLowerCase()) : undefined
        if (!original || c.source.value === null) throw new Error(`„${c.source.name}“ kann nicht aktualisiert werden.`)
        saveConfigSnapshot(original.id, 'Vor Import', original.value)
        await svc.updateConfiguration(original, c.source.value)
        updatedNames.push(original.name)
      }
    }

    const map = buildIdMap(plan, created)
    if (mode.kind === 'new') {
      const content = composeContent(pkg, map, { name: mode.name, shareType: mode.shareType, order: mode.order, includeFilterValues })
      const boardId = await svc.createBoard(content)
      return { boardId, createdConfigs: createdNames, updatedConfigs: updatedNames }
    }
    const b = mode.board
    const content = composeContent(pkg, map, { name: b.name, shareType: b.shareType, order: b.order, includeFilterValues })
    saveSnapshot(b.id, 'Vor Import', b.content)
    await svc.updateBoard(b, content)
    return { boardId: b.id, createdConfigs: createdNames, updatedConfigs: updatedNames }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const done = [
      createdNames.length ? `angelegt: ${createdNames.join(', ')}` : '',
      updatedNames.length ? `aktualisiert: ${updatedNames.join(', ')}` : '',
    ].filter(Boolean)
    throw new Error(done.length ? `${msg} — Konfigurationen bereits ${done.join('; ')}.` : msg, { cause: err })
  }
}

/** The new board content, for the preview before writing. */
export function previewContent(pkg: BoardPackage, plan: ImportPlan, mode: ImportMode, includeFilterValues: boolean) {
  // Configurations to be created get a placeholder ID in the preview.
  const placeholder = new Map(plan.configs.filter((c) => c.action === 'create').map((c) => [c.source.id.toLowerCase(), '(neu)']))
  const map = buildIdMap(plan, placeholder)
  return mode.kind === 'new'
    ? composeContent(pkg, map, { name: mode.name, shareType: mode.shareType, order: mode.order, includeFilterValues })
    : composeContent(pkg, map, { name: mode.board.name, shareType: mode.board.shareType, order: mode.board.order, includeFilterValues })
}
