import type {
  ColumnRef,
  PreviewResult,
  SavedViewRef,
  TableRef,
  TransferEntry,
  TransferEntryInput,
  TransferPackage,
  TransferPackageInput,
  TransferRun,
} from '../types/transferHub'
import {
  MATCH_MODE_CODES,
  ORPHAN_CODES,
  QUERY_MODE_CODES,
  RECURRENCE_CODES,
  RUN_STATUS_CODES,
  DELTA_MODE_CODES,
  deltaModeFromCode,
  matchModeFromCode,
  orphanFromCode,
  queryModeFromCode,
  recurrenceFromCode,
  runStatusFromCode,
} from '../types/transferHub'
import type { CreateRunOptions, TransferHubService } from './transferHubService'
import { mockTransferHubService } from './mockTransferHubService'
import { powerModeReady } from '../PowerProvider'
import { fetchXmlQuery, odataQuery, rowNum, rowStr, type Row } from './currentEnvQuery'
import { orgUrlForEnvKey } from '../config'
import {
  COUNT_ALIAS,
  buildColumnPlan,
  buildCountFetchXml,
  fetchTop,
  joinCsvList,
  parseCsvList,
  parseFetchXml,
  parseWatermarks,
  previewColumnsFromRow,
  withDeltaCondition,
  withRowLimit,
  type ColumnPlan,
  type PlanAttributeMeta,
} from '../utils/transferConfig'
import { Pro_transferpackagesService } from '../generated/services/Pro_transferpackagesService'
import { Pro_transferentriesService } from '../generated/services/Pro_transferentriesService'
import { Pro_transferrunsService } from '../generated/services/Pro_transferrunsService'
import type { Pro_transferruns, Pro_transferrunsBase } from '../generated/models/Pro_transferrunsModel'
import type { Pro_transferpackages, Pro_transferpackagesBase } from '../generated/models/Pro_transferpackagesModel'
import type { Pro_transferentries, Pro_transferentriesBase } from '../generated/models/Pro_transferentriesModel'
import type { IGetAllOptions } from '../generated/models/CommonModels'
import type { IOperationResult } from '@microsoft/power-apps/data'

/**
 * Real implementation of {@link TransferHubService}.
 *
 * Configuration CRUD is native (signed-in user) against the host tables;
 * source-environment lookups run through the connector (SP identity) so the
 * hub can browse tables/views and preview data in ANY configured environment.
 */

/** Source-table metadata the column plan is built from (cached per session). */
interface PlanMetadata {
  attrs: PlanAttributeMeta[]
  /** ReferencingAttribute → referenced entity logical names (>1 = polymorphic). */
  lookupTargets: Record<string, string[]>
  primaryIdAttribute: string
}

/** Metadata Label → localized display label. */
function label(value: unknown): string {
  const v = value as { UserLocalizedLabel?: { Label?: string } } | undefined
  return v?.UserLocalizedLabel?.Label ?? ''
}

const GUID_RE = /^[0-9a-fA-F-]{32,36}$/

/** Page through a generated getAll until the result set is exhausted. */
async function fetchAll<T>(
  getAll: (options?: IGetAllOptions) => Promise<IOperationResult<T[]>>,
  options: IGetAllOptions,
): Promise<T[]> {
  const rows: T[] = []
  let skipToken: string | undefined
  do {
    const result = await getAll({ ...options, ...(skipToken ? { skipToken } : {}) })
    if (!result.success || !result.data) {
      console.warn('[transfer] page fetch failed — result:', result)
      throw new Error('Reading the transfer configuration failed.')
    }
    rows.push(...result.data)
    skipToken = result.skipToken
  } while (skipToken)
  return rows
}

/**
 * Columns provisioned after the typed client was generated are appended as
 * plain strings — the generated models only know the older shape, and
 * regenerating the data source is a manual installer step (gotcha #1).
 */
const LATE_PACKAGE_COLUMNS = ['pro_recurrence_opt', 'pro_nextrun_dat']
const LATE_RUN_COLUMNS = ['pro_dryrun_bit']
// pro_deltafetchxml_txt is written but never selected — up to a megabyte, and
// only the executor reads it.
const LATE_ENTRY_COLUMNS = ['pro_deltamode_opt', 'pro_deltawatermarks_txt']

const PACKAGE_SELECT: string[] = [
  ...([
    'pro_transferpackageid',
    'pro_name',
    'pro_description_txt',
    'pro_targetenvs_str',
    'pro_order_int',
    'statecode',
    'modifiedon',
  ] satisfies (keyof Pro_transferpackages)[]),
  ...LATE_PACKAGE_COLUMNS,
]

const ENTRY_SELECT: string[] = [
  ...([
    'pro_transferentryid',
    'pro_name',
    'pro_sourceenv_str',
    'pro_sourcetable_str',
    'pro_sourcetabledisplay_str',
    'pro_sourceentityset_str',
    'pro_primaryidattr_str',
    'pro_querymode_opt',
    'pro_viewid_str',
    'pro_viewname_str',
    'pro_viewsnapshotat_dat',
    'pro_fetchxml_txt',
    'pro_matchmode_opt',
    'pro_matchcolumns_str',
    'pro_orphanhandling_opt',
    'pro_order_int',
    'pro_notes_txt',
    'pro_columnplan_txt',
    'statecode',
    '_pro_package_ref_value',
  ] satisfies (keyof Pro_transferentries)[]),
  ...LATE_ENTRY_COLUMNS,
]

const RUN_SELECT: string[] = [
  ...([
    'pro_transferrunid',
    'pro_name',
    'pro_status_opt',
    'pro_targetenvs_str',
    'pro_scheduledfor_dat',
    'pro_startedon_dat',
    'pro_finishedon_dat',
    'pro_summary_str',
    'pro_log_txt',
    'createdon',
    '_pro_package_ref_value',
    '_createdby_value',
  ] satisfies (keyof Pro_transferruns)[]),
  ...LATE_RUN_COLUMNS,
]

/** Reads a column the generated model does not know yet (see above). */
function late(row: unknown, column: string): unknown {
  return (row as Record<string, unknown>)[column]
}

/**
 * Schedule fields of a package write. 'none' clears the next-run stamp so the
 * scheduler flow can filter on `pro_recurrence_opt ne 867520000` alone.
 */
function recurrenceFields(input: TransferPackageInput): Record<string, unknown> {
  const recurring = input.recurrence !== 'none'
  return {
    pro_recurrence_opt: RECURRENCE_CODES[input.recurrence],
    pro_nextrun_dat: recurring && input.nextRun ? input.nextRun : null,
  }
}

/** Formatted-value annotation of a column, when the client returned it. */
function fv(row: unknown, column: string): string {
  const value = (row as Record<string, unknown>)[
    `${column}@OData.Community.Display.V1.FormattedValue`
  ]
  return typeof value === 'string' ? value : ''
}

function toRun(row: Pro_transferruns): TransferRun {
  return {
    id: row.pro_transferrunid,
    packageId: row._pro_package_ref_value ?? '',
    name: row.pro_name ?? '',
    status: runStatusFromCode(row.pro_status_opt),
    targetEnvKeys: parseCsvList(row.pro_targetenvs_str),
    scheduledFor: row.pro_scheduledfor_dat ?? '',
    requestedOn: row.createdon ?? '',
    requestedBy: fv(row, '_createdby_value'),
    startedOn: row.pro_startedon_dat ?? '',
    finishedOn: row.pro_finishedon_dat ?? '',
    summary: row.pro_summary_str ?? '',
    log: row.pro_log_txt ?? '',
    dryRun: late(row, 'pro_dryrun_bit') === true,
  }
}

function toPackage(row: Pro_transferpackages): TransferPackage {
  return {
    id: row.pro_transferpackageid,
    name: row.pro_name ?? '',
    description: row.pro_description_txt ?? '',
    targetEnvKeys: parseCsvList(row.pro_targetenvs_str),
    order: row.pro_order_int ?? 0,
    active: Number(row.statecode ?? 0) === 0,
    recurrence: recurrenceFromCode(late(row, 'pro_recurrence_opt') as number | null),
    nextRun: (late(row, 'pro_nextrun_dat') as string | null) ?? '',
    modifiedOn: row.modifiedon,
  }
}

function toEntry(row: Pro_transferentries): TransferEntry {
  return {
    id: row.pro_transferentryid,
    packageId: row._pro_package_ref_value ?? '',
    name: row.pro_name ?? '',
    sourceEnvKey: row.pro_sourceenv_str ?? '',
    tableLogicalName: row.pro_sourcetable_str ?? '',
    tableDisplayName: row.pro_sourcetabledisplay_str ?? '',
    entitySet: row.pro_sourceentityset_str ?? '',
    primaryIdAttribute: row.pro_primaryidattr_str ?? '',
    queryMode: queryModeFromCode(row.pro_querymode_opt),
    viewId: row.pro_viewid_str ?? '',
    viewName: row.pro_viewname_str ?? '',
    viewSnapshotAt: row.pro_viewsnapshotat_dat ?? '',
    fetchXml: row.pro_fetchxml_txt ?? '',
    matchMode: matchModeFromCode(row.pro_matchmode_opt),
    matchColumns: parseCsvList(row.pro_matchcolumns_str),
    orphanHandling: orphanFromCode(row.pro_orphanhandling_opt),
    order: row.pro_order_int ?? 0,
    notes: row.pro_notes_txt ?? '',
    active: Number(row.statecode ?? 0) === 0,
    columnPlan: row.pro_columnplan_txt ?? '',
    deltaMode: deltaModeFromCode(late(row, 'pro_deltamode_opt') as number | null),
    deltaWatermarks: parseWatermarks(late(row, 'pro_deltawatermarks_txt') as string | null),
  }
}

/** Entry create/update payload from the input shape (id-less, cast at call). */
function entryRecord(input: TransferEntryInput): Record<string, unknown> {
  return {
    pro_name: input.name,
    'pro_package_ref@odata.bind': `/pro_transferpackages(${input.packageId})`,
    pro_sourceenv_str: input.sourceEnvKey,
    pro_sourcetable_str: input.tableLogicalName,
    pro_sourcetabledisplay_str: input.tableDisplayName,
    pro_sourceentityset_str: input.entitySet,
    pro_primaryidattr_str: input.primaryIdAttribute,
    pro_querymode_opt: QUERY_MODE_CODES[input.queryMode],
    pro_viewid_str: input.viewId,
    pro_viewname_str: input.viewName,
    pro_viewsnapshotat_dat: input.viewSnapshotAt || null,
    pro_fetchxml_txt: input.fetchXml,
    pro_matchmode_opt: MATCH_MODE_CODES[input.matchMode],
    pro_matchcolumns_str: joinCsvList(input.matchColumns) || null,
    pro_orphanhandling_opt: ORPHAN_CODES[input.orphanHandling],
    pro_deltamode_opt: DELTA_MODE_CODES[input.deltaMode],
    // The executor has no XML tooling — it can only replace() the __DELTA__
    // hole, so the whole filtered query is pre-built here. Cleared when delta
    // is off, so a stale template can never be picked up.
    pro_deltafetchxml_txt:
      input.deltaMode === 'modified' ? (withDeltaCondition(input.fetchXml) ?? '') : '',
    pro_order_int: input.order,
    pro_notes_txt: input.notes,
  }
}

class DataverseTransferHubService implements TransferHubService {
  /** EntityDefinitions per org are large — cache the table list per orgUrl. */
  private tablesByOrg = new Map<string, TableRef[]>()

  // ---- packages -----------------------------------------------------------

  async listPackages(): Promise<TransferPackage[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.listPackages()
    const rows = await fetchAll((o) => Pro_transferpackagesService.getAll(o), {
      select: PACKAGE_SELECT as string[],
      orderBy: ['pro_order_int asc', 'pro_name asc'],
    })
    const packages = rows.map(toPackage)
    // Entry counts — one cheap scan, best-effort (the list works without it).
    try {
      const entries = await fetchAll((o) => Pro_transferentriesService.getAll(o), {
        select: ['pro_transferentryid', '_pro_package_ref_value'],
      })
      const counts = new Map<string, number>()
      for (const e of entries) {
        const pid = e._pro_package_ref_value ?? ''
        counts.set(pid, (counts.get(pid) ?? 0) + 1)
      }
      for (const p of packages) p.entryCount = counts.get(p.id) ?? 0
    } catch (err) {
      console.warn('[transfer] entry-count scan failed:', err)
    }
    return packages
  }

  async createPackage(input: TransferPackageInput): Promise<TransferPackage> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.createPackage(input)
    const record = {
      pro_name: input.name,
      pro_description_txt: input.description,
      pro_targetenvs_str: joinCsvList(input.targetEnvKeys) || null,
      pro_order_int: input.order,
      ...recurrenceFields(input),
    } as unknown as Omit<Pro_transferpackagesBase, 'pro_transferpackageid'>
    const result = await Pro_transferpackagesService.create(record)
    if (!result.success || !result.data) {
      console.warn('[transfer] package create failed — result:', result)
      throw new Error(`Creating the package "${input.name}" failed.`)
    }
    return { ...toPackage(result.data), entryCount: 0 }
  }

  async updatePackage(id: string, input: TransferPackageInput): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.updatePackage(id, input)
    const changed = {
      pro_name: input.name,
      pro_description_txt: input.description,
      pro_targetenvs_str: joinCsvList(input.targetEnvKeys) || null,
      pro_order_int: input.order,
      ...recurrenceFields(input),
    } as unknown as Partial<Omit<Pro_transferpackagesBase, 'pro_transferpackageid'>>
    const result = await Pro_transferpackagesService.update(id, changed)
    if (!result.success) {
      console.warn('[transfer] package update failed — result:', result)
      throw new Error(`Saving the package "${input.name}" failed.`)
    }
  }

  async deletePackage(id: string): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.deletePackage(id)
    await Pro_transferpackagesService.delete(id)
  }

  async setPackageActive(id: string, active: boolean): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.setPackageActive(id, active)
    // statecode via the native update — verify-on-first-use (CLAUDE.md).
    const changed = { statecode: active ? 0 : 1 } as unknown as Partial<
      Omit<Pro_transferpackagesBase, 'pro_transferpackageid'>
    >
    const result = await Pro_transferpackagesService.update(id, changed)
    if (!result.success) {
      console.warn('[transfer] package statecode update failed — result:', result)
      throw new Error('Changing the package state failed.')
    }
  }

  // ---- entries ------------------------------------------------------------

  async listEntries(packageId: string): Promise<TransferEntry[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.listEntries(packageId)
    const rows = await fetchAll((o) => Pro_transferentriesService.getAll(o), {
      select: ENTRY_SELECT,
      filter: `_pro_package_ref_value eq ${packageId}`,
      orderBy: ['pro_order_int asc', 'pro_name asc'],
    })
    return rows.map(toEntry)
  }

  async createEntry(input: TransferEntryInput): Promise<TransferEntry> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.createEntry(input)
    const record = {
      ...entryRecord(input),
      pro_columnplan_txt: await this.columnPlanSafe(input),
    }
    const result = await Pro_transferentriesService.create(
      record as unknown as Omit<Pro_transferentriesBase, 'pro_transferentryid'>,
    )
    if (!result.success || !result.data) {
      console.warn('[transfer] entry create failed — result:', result)
      throw new Error(`Creating the entry "${input.name}" failed.`)
    }
    return toEntry(result.data)
  }

  async updateEntry(id: string, input: TransferEntryInput): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.updateEntry(id, input)
    const record = {
      ...entryRecord(input),
      pro_columnplan_txt: await this.columnPlanSafe(input),
    }
    const result = await Pro_transferentriesService.update(
      id,
      record as unknown as Partial<Omit<Pro_transferentriesBase, 'pro_transferentryid'>>,
    )
    if (!result.success) {
      console.warn('[transfer] entry update failed — result:', result)
      throw new Error(`Saving the entry "${input.name}" failed.`)
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.deleteEntry(id)
    await Pro_transferentriesService.delete(id)
  }

  async resetDelta(id: string): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.resetDelta(id)
    const changed = { pro_deltawatermarks_txt: null } as unknown as Partial<
      Omit<Pro_transferentriesBase, 'pro_transferentryid'>
    >
    const result = await Pro_transferentriesService.update(id, changed)
    if (!result.success) {
      console.warn('[transfer] delta reset failed — result:', result)
      throw new Error('Resetting the delta watermarks failed.')
    }
  }

  async setEntryActive(id: string, active: boolean): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.setEntryActive(id, active)
    const changed = { statecode: active ? 0 : 1 } as unknown as Partial<
      Omit<Pro_transferentriesBase, 'pro_transferentryid'>
    >
    const result = await Pro_transferentriesService.update(id, changed)
    if (!result.success) {
      console.warn('[transfer] entry statecode update failed — result:', result)
      throw new Error('Changing the entry state failed.')
    }
  }

  async reorderEntries(orderedIds: string[]): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.reorderEntries(orderedIds)
    // Serial on purpose — a handful of rows, and order collisions are benign.
    for (let i = 0; i < orderedIds.length; i++) {
      const changed = { pro_order_int: i + 1 } as unknown as Partial<
        Omit<Pro_transferentriesBase, 'pro_transferentryid'>
      >
      const result = await Pro_transferentriesService.update(orderedIds[i], changed)
      if (!result.success) {
        console.warn('[transfer] reorder update failed — result:', result)
        throw new Error('Saving the new order failed.')
      }
    }
  }

  async refreshViewSnapshot(entryId: string): Promise<TransferEntry> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.refreshViewSnapshot(entryId)
    const got = await Pro_transferentriesService.get(entryId, {
      select: ENTRY_SELECT,
    })
    if (!got.success || !got.data) throw new Error('Reading the entry failed.')
    const entry = toEntry(got.data)
    if (!entry.viewId) throw new Error('This entry has no saved-view reference.')
    const view = await this.getViewFetchXml(entry.sourceEnvKey, entry.viewId)
    const snapshotAt = new Date().toISOString()
    // The view's columns may have changed — recompute the write recipe too.
    const columnPlan = await this.columnPlanSafe({
      sourceEnvKey: entry.sourceEnvKey,
      tableLogicalName: entry.tableLogicalName,
      fetchXml: view.fetchXml,
    })
    const changed = {
      pro_fetchxml_txt: view.fetchXml,
      pro_viewname_str: view.name,
      pro_viewsnapshotat_dat: snapshotAt,
      pro_columnplan_txt: columnPlan,
      // The delta template is derived from the query — a re-snapshot invalidates
      // it just as it invalidates the column plan.
      pro_deltafetchxml_txt:
        entry.deltaMode === 'modified' ? (withDeltaCondition(view.fetchXml) ?? '') : '',
    } as unknown as Partial<Omit<Pro_transferentriesBase, 'pro_transferentryid'>>
    const result = await Pro_transferentriesService.update(entryId, changed)
    if (!result.success) {
      console.warn('[transfer] snapshot update failed — result:', result)
      throw new Error('Saving the refreshed snapshot failed.')
    }
    return {
      ...entry,
      fetchXml: view.fetchXml,
      viewName: view.name,
      viewSnapshotAt: snapshotAt,
      columnPlan,
    }
  }

  // ---- runs ---------------------------------------------------------------

  async createRun(pkg: TransferPackage, opts: CreateRunOptions = {}): Promise<TransferRun> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.createRun(pkg, opts)
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const record = {
      pro_name: `${opts.dryRun ? 'DRY RUN — ' : ''}${pkg.name} — ${stamp} UTC`,
      'pro_package_ref@odata.bind': `/pro_transferpackages(${pkg.id})`,
      // Scheduled runs wait for the scheduler flow to flip them to Queued.
      pro_status_opt: opts.scheduledFor ? RUN_STATUS_CODES.scheduled : RUN_STATUS_CODES.queued,
      pro_scheduledfor_dat: opts.scheduledFor || null,
      // Target snapshot at request time — later package edits must not
      // change what an already-queued run does.
      pro_targetenvs_str: joinCsvList(pkg.targetEnvKeys) || null,
      pro_dryrun_bit: opts.dryRun === true,
    } as unknown as Omit<Pro_transferrunsBase, 'pro_transferrunid'>
    const result = await Pro_transferrunsService.create(record)
    if (!result.success || !result.data) {
      console.warn('[transfer] run create failed — result:', result)
      throw new Error(`Queuing a run for "${pkg.name}" failed.`)
    }
    return toRun(result.data)
  }

  async cancelRun(id: string): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.cancelRun(id)
    const changed = { pro_status_opt: RUN_STATUS_CODES.cancelled } as unknown as Partial<
      Omit<Pro_transferrunsBase, 'pro_transferrunid'>
    >
    const result = await Pro_transferrunsService.update(id, changed)
    if (!result.success) {
      console.warn('[transfer] run cancel failed — result:', result)
      throw new Error('Cancelling the run failed.')
    }
  }

  async listRuns(packageId: string, top = 20): Promise<TransferRun[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.listRuns(packageId, top)
    const rows = await fetchAll((o) => Pro_transferrunsService.getAll(o), {
      select: RUN_SELECT as string[],
      filter: `_pro_package_ref_value eq ${packageId}`,
      orderBy: ['createdon desc'],
    })
    return rows.slice(0, top).map(toRun)
  }

  // ---- source-environment reads (connector) -------------------------------

  async listTables(envKey: string): Promise<TableRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.listTables(envKey)
    const orgUrl = orgUrlForEnvKey(envKey)
    const cached = this.tablesByOrg.get(orgUrl)
    if (cached) return cached
    const rows = await odataQuery(
      'EntityDefinitions',
      'LogicalName,EntitySetName,PrimaryIdAttribute,DisplayName,DisplayCollectionName',
      { orgUrl },
    )
    const tables: TableRef[] = rows
      .map((row: Row) => ({
        logicalName: rowStr(row.LogicalName),
        displayName: label(row.DisplayName) || rowStr(row.LogicalName),
        displayCollectionName:
          label(row.DisplayCollectionName) || label(row.DisplayName) || rowStr(row.LogicalName),
        entitySet: rowStr(row.EntitySetName),
        primaryIdAttribute: rowStr(row.PrimaryIdAttribute),
      }))
      .filter((t) => t.logicalName && t.entitySet)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    this.tablesByOrg.set(orgUrl, tables)
    return tables
  }

  async listViews(envKey: string, tableLogicalName: string): Promise<SavedViewRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.listViews(envKey, tableLogicalName)
    // System views only (querytype 0); the fetchxml column is deliberately NOT
    // selected here — it is resolved per view on save (keeps the list cheap).
    // MUST be an OData filter: in FetchXML the EntityName attribute
    // `returnedtypecode` expects the numeric ObjectTypeCode (a logical-name
    // string throws 0x80040203 FormatException — verified live on INT-11);
    // via OData it is a string and matches the logical name.
    const safe = tableLogicalName.replace(/'/g, "''")
    const rows = await odataQuery('savedqueries', 'savedqueryid,name,description,isdefault', {
      orgUrl: orgUrlForEnvKey(envKey),
      filter: `returnedtypecode eq '${safe}' and querytype eq 0 and statecode eq 0`,
    })
    return rows
      .map((row) => ({
        id: rowStr(row.savedqueryid),
        name: rowStr(row.name),
        description: rowStr(row.description),
        isDefault: row.isdefault === true,
      }))
      .filter((v) => v.id)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async getViewFetchXml(
    envKey: string,
    viewId: string,
  ): Promise<{ name: string; fetchXml: string }> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.getViewFetchXml(envKey, viewId)
    if (!GUID_RE.test(viewId)) throw new Error('Invalid view id.')
    const rows = await odataQuery('savedqueries', 'savedqueryid,name,fetchxml', {
      orgUrl: orgUrlForEnvKey(envKey),
      filter: `savedqueryid eq ${viewId}`,
    })
    const row = rows[0]
    if (!row) throw new Error('The saved view no longer exists in the source environment.')
    const fetchXml = rowStr(row.fetchxml)
    if (!fetchXml) throw new Error('The saved view has no FetchXML.')
    return { name: rowStr(row.name), fetchXml }
  }

  async listColumns(envKey: string, tableLogicalName: string): Promise<ColumnRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTransferHubService.listColumns(envKey, tableLogicalName)
    const safe = tableLogicalName.replace(/'/g, "''")
    const rows = await odataQuery('EntityDefinitions', 'LogicalName', {
      orgUrl: orgUrlForEnvKey(envKey),
      filter: `LogicalName eq '${safe}'`,
      expand: 'Attributes($select=LogicalName,DisplayName,AttributeType)',
    })
    const attrs = (rows[0]?.Attributes as Array<Record<string, unknown>> | undefined) ?? []
    return attrs
      .map((a) => ({
        logicalName: rowStr(a.LogicalName),
        displayName: label(a.DisplayName) || rowStr(a.LogicalName),
        attributeType: rowStr(a.AttributeType),
      }))
      .filter((c) => c.logicalName)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * Compute the executor's write recipe (ColumnPlan JSON) from the source
   * table's metadata: writable scalars, single-target lookups with their
   * entity sets, and skipped columns with reasons. Best-effort wrapper —
   * '' on failure (the executor then errors the entry with a clear message).
   */
  private async columnPlanSafe(input: {
    sourceEnvKey: string
    tableLogicalName: string
    fetchXml: string
  }): Promise<string> {
    try {
      return JSON.stringify(
        await this.computeColumnPlan(
          input.sourceEnvKey,
          input.tableLogicalName,
          input.fetchXml,
        ),
      )
    } catch (err) {
      console.warn('[transfer] column-plan computation failed:', err)
      return ''
    }
  }

  async previewColumnPlan(
    envKey: string,
    tableLogicalName: string,
    fetchXml: string,
  ): Promise<ColumnPlan | null> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTransferHubService.previewColumnPlan(envKey, tableLogicalName, fetchXml)
    try {
      return await this.computeColumnPlan(envKey, tableLogicalName, fetchXml)
    } catch (err) {
      // Authoring must survive an unreachable source environment — the dialog
      // shows nothing rather than a scary error, and save still computes it.
      console.warn('[transfer] column-plan preview failed:', err)
      return null
    }
  }

  private async computeColumnPlan(
    envKey: string,
    table: string,
    fetchXml: string,
  ): Promise<ColumnPlan> {
    const orgUrl = orgUrlForEnvKey(envKey)
    const parsed = parseFetchXml(fetchXml)
    const fetchAttrs =
      parsed.ok && !parsed.allAttributes && parsed.attributes.length > 0
        ? parsed.attributes
        : null
    const { attrs, lookupTargets, primaryIdAttribute } = await this.loadPlanMetadata(orgUrl, table)
    // Resolve entity sets only for single-target lookups in scope.
    const entitySetByTable: Record<string, string> = {}
    const wanted = new Set(fetchAttrs ?? attrs.map((a) => a.logicalName))
    for (const [attr, targets] of Object.entries(lookupTargets)) {
      const unique = [...new Set(targets)]
      if (unique.length !== 1 || !wanted.has(attr) || entitySetByTable[unique[0]]) continue
      try {
        entitySetByTable[unique[0]] = (await this.resolveEntityInfo(orgUrl, unique[0])).set
      } catch (err) {
        console.warn('[transfer] lookup target set resolution failed:', unique[0], err)
      }
    }
    return buildColumnPlan(
      fetchAttrs,
      attrs,
      primaryIdAttribute,
      lookupTargets,
      entitySetByTable,
    )
  }

  /** orgUrl|table → plan metadata (see {@link loadPlanMetadata}). */
  private planMetaByTable = new Map<string, PlanMetadata>()

  /**
   * The source table's attribute + relationship metadata behind the column
   * plan. Cached per session because the entry dialog recomputes the plan on
   * every query edit — the same read otherwise runs on every keystroke. A
   * schema change in the source environment needs a page reload to show up,
   * which matches how the rest of the app caches metadata.
   */
  private async loadPlanMetadata(orgUrl: string, table: string): Promise<PlanMetadata> {
    const cacheKey = `${orgUrl}|${table}`
    const cached = this.planMetaByTable.get(cacheKey)
    if (cached) return cached
    const safe = table.replace(/'/g, "''")
    const rows = await odataQuery('EntityDefinitions', 'LogicalName,PrimaryIdAttribute', {
      orgUrl,
      filter: `LogicalName eq '${safe}'`,
      expand:
        'Attributes($select=LogicalName,AttributeType,AttributeTypeName,IsValidForCreate,IsValidForUpdate,AttributeOf),' +
        'ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity)',
    })
    const row = rows[0]
    if (!row) throw new Error(`Metadata for ${table} not found.`)
    const attrs: PlanAttributeMeta[] = (
      (row.Attributes as Array<Record<string, unknown>> | undefined) ?? []
    ).map((a) => ({
      logicalName: rowStr(a.LogicalName),
      attributeType: rowStr(a.AttributeType),
      attributeTypeName: (a.AttributeTypeName as { Value?: string } | undefined)?.Value ?? '',
      isValidForCreate: a.IsValidForCreate === true,
      isValidForUpdate: a.IsValidForUpdate === true,
      attributeOf: a.AttributeOf ? rowStr(a.AttributeOf) : null,
    }))
    const lookupTargets: Record<string, string[]> = {}
    for (const rel of (row.ManyToOneRelationships as Array<Record<string, unknown>> | undefined) ??
      []) {
      const attr = rowStr(rel.ReferencingAttribute)
      const target = rowStr(rel.ReferencedEntity)
      if (!attr || !target) continue
      ;(lookupTargets[attr] ??= []).push(target)
    }
    const meta: PlanMetadata = {
      attrs,
      lookupTargets,
      primaryIdAttribute: rowStr(row.PrimaryIdAttribute),
    }
    this.planMetaByTable.set(cacheKey, meta)
    return meta
  }

  /** table → { entitySet, primaryIdAttribute } cache per orgUrl. */
  private entityInfoByOrg = new Map<string, Map<string, { set: string; idAttr: string }>>()

  private async resolveEntityInfo(
    orgUrl: string,
    tableLogicalName: string,
  ): Promise<{ set: string; idAttr: string }> {
    let byTable = this.entityInfoByOrg.get(orgUrl)
    if (!byTable) {
      byTable = new Map()
      this.entityInfoByOrg.set(orgUrl, byTable)
    }
    const cached = byTable.get(tableLogicalName)
    if (cached) return cached
    const safe = tableLogicalName.replace(/'/g, "''")
    const rows = await odataQuery(
      'EntityDefinitions',
      'LogicalName,EntitySetName,PrimaryIdAttribute',
      { orgUrl, filter: `LogicalName eq '${safe}'` },
    )
    const row = rows[0]
    const info = {
      set: rowStr(row?.EntitySetName) || `${tableLogicalName}s`,
      idAttr: rowStr(row?.PrimaryIdAttribute) || `${tableLogicalName}id`,
    }
    byTable.set(tableLogicalName, info)
    return info
  }

  async preview(
    envKey: string,
    tableLogicalName: string,
    fetchXml: string,
    maxRows = 25,
  ): Promise<PreviewResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTransferHubService.preview(envKey, tableLogicalName, fetchXml, maxRows)
    const orgUrl = orgUrlForEnvKey(envKey)
    const info = await this.resolveEntityInfo(orgUrl, tableLogicalName)
    const limited = withRowLimit(fetchXml, maxRows)
    const rows = await fetchXmlQuery(info.set, limited, orgUrl)

    const parsed = parseFetchXml(fetchXml)
    let columns =
      parsed.ok && !parsed.allAttributes && parsed.attributes.length > 0
        ? parsed.attributes
        : []
    if (columns.length === 0 && rows.length > 0)
      columns = previewColumnsFromRow(rows[0])

    // Best-effort total (same filter, aggregate count) — null for aggregate
    // queries; >50k rows throws and simply leaves the badge off (same
    // degradation as the Job Monitor). An author-written `top` caps the
    // number (aggregates ignore top, but the transfer honors it).
    let totalCount: number | undefined
    const countXml = buildCountFetchXml(fetchXml, info.idAttr)
    if (countXml) {
      try {
        const countRows = await fetchXmlQuery(info.set, countXml, orgUrl)
        const value = countRows[0]?.[COUNT_ALIAS]
        totalCount = value === undefined || value === null ? undefined : rowNum(value)
        const top = fetchTop(fetchXml)
        if (totalCount !== undefined && top !== null) totalCount = Math.min(totalCount, top)
      } catch (err) {
        console.warn('[transfer] preview count failed (ignored):', err)
      }
    }
    return { columns, rows, totalCount, limit: maxRows }
  }

  async countRows(
    envKey: string,
    tableLogicalName: string,
    fetchXml: string,
  ): Promise<number | undefined> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTransferHubService.countRows(envKey, tableLogicalName, fetchXml)
    const orgUrl = orgUrlForEnvKey(envKey)
    const info = await this.resolveEntityInfo(orgUrl, tableLogicalName)
    const countXml = buildCountFetchXml(fetchXml, info.idAttr)
    if (!countXml) return undefined
    try {
      const rows = await fetchXmlQuery(info.set, countXml, orgUrl)
      const value = rows[0]?.[COUNT_ALIAS]
      if (value === undefined || value === null) return undefined
      // Aggregates ignore `top` — cap manually so the column matches what
      // the executor would actually transfer.
      const count = rowNum(value)
      const top = fetchTop(fetchXml)
      return top !== null ? Math.min(count, top) : count
    } catch (err) {
      console.warn('[transfer] countRows failed:', err)
      return undefined
    }
  }
}

export const dataverseTransferHubService: TransferHubService =
  new DataverseTransferHubService()
