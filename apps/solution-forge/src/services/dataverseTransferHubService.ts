import type {
  ColumnRef,
  PreviewResult,
  SavedViewRef,
  TableRef,
  TransferEntry,
  TransferEntryInput,
  TransferPackage,
  TransferPackageInput,
} from '../types/transferHub'
import {
  MATCH_MODE_CODES,
  ORPHAN_CODES,
  QUERY_MODE_CODES,
  matchModeFromCode,
  orphanFromCode,
  queryModeFromCode,
} from '../types/transferHub'
import type { TransferHubService } from './transferHubService'
import { mockTransferHubService } from './mockTransferHubService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlEscape,
  fetchXmlQuery,
  odataQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { orgUrlForEnvKey } from '../config'
import {
  COUNT_ALIAS,
  buildCountFetchXml,
  joinCsvList,
  parseCsvList,
  parseFetchXml,
  withRowLimit,
} from '../utils/transferConfig'
import { Pro_transferpackagesService } from '../generated/services/Pro_transferpackagesService'
import { Pro_transferentriesService } from '../generated/services/Pro_transferentriesService'
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

const PACKAGE_SELECT: (keyof Pro_transferpackages)[] = [
  'pro_transferpackageid',
  'pro_name',
  'pro_description_txt',
  'pro_targetenvs_str',
  'pro_order_int',
  'statecode',
  'modifiedon',
]

const ENTRY_SELECT: (keyof Pro_transferentries)[] = [
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
  'statecode',
  '_pro_package_ref_value',
]

function toPackage(row: Pro_transferpackages): TransferPackage {
  return {
    id: row.pro_transferpackageid,
    name: row.pro_name ?? '',
    description: row.pro_description_txt ?? '',
    targetEnvKeys: parseCsvList(row.pro_targetenvs_str),
    order: row.pro_order_int ?? 0,
    active: Number(row.statecode ?? 0) === 0,
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
      select: ENTRY_SELECT as string[],
      filter: `_pro_package_ref_value eq ${packageId}`,
      orderBy: ['pro_order_int asc', 'pro_name asc'],
    })
    return rows.map(toEntry)
  }

  async createEntry(input: TransferEntryInput): Promise<TransferEntry> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTransferHubService.createEntry(input)
    const result = await Pro_transferentriesService.create(
      entryRecord(input) as unknown as Omit<Pro_transferentriesBase, 'pro_transferentryid'>,
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
    const result = await Pro_transferentriesService.update(
      id,
      entryRecord(input) as unknown as Partial<Omit<Pro_transferentriesBase, 'pro_transferentryid'>>,
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
      select: ENTRY_SELECT as string[],
    })
    if (!got.success || !got.data) throw new Error('Reading the entry failed.')
    const entry = toEntry(got.data)
    if (!entry.viewId) throw new Error('This entry has no saved-view reference.')
    const view = await this.getViewFetchXml(entry.sourceEnvKey, entry.viewId)
    const snapshotAt = new Date().toISOString()
    const changed = {
      pro_fetchxml_txt: view.fetchXml,
      pro_viewname_str: view.name,
      pro_viewsnapshotat_dat: snapshotAt,
    } as unknown as Partial<Omit<Pro_transferentriesBase, 'pro_transferentryid'>>
    const result = await Pro_transferentriesService.update(entryId, changed)
    if (!result.success) {
      console.warn('[transfer] snapshot update failed — result:', result)
      throw new Error('Saving the refreshed snapshot failed.')
    }
    return { ...entry, fetchXml: view.fetchXml, viewName: view.name, viewSnapshotAt: snapshotAt }
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
      'LogicalName,EntitySetName,PrimaryIdAttribute,DisplayName',
      { orgUrl },
    )
    const tables: TableRef[] = rows
      .map((row: Row) => ({
        logicalName: rowStr(row.LogicalName),
        displayName: label(row.DisplayName) || rowStr(row.LogicalName),
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
    const xml = `<fetch><entity name="savedquery">
      <attribute name="savedqueryid"/><attribute name="name"/>
      <attribute name="description"/><attribute name="isdefault"/>
      <filter>
        <condition attribute="returnedtypecode" operator="eq" value="${fetchXmlEscape(tableLogicalName)}"/>
        <condition attribute="querytype" operator="eq" value="0"/>
        <condition attribute="statecode" operator="eq" value="0"/>
      </filter>
      <order attribute="name"/>
    </entity></fetch>`
    const rows = await fetchXmlQuery('savedqueries', xml, orgUrlForEnvKey(envKey))
    return rows
      .map((row) => ({
        id: rowStr(row.savedqueryid),
        name: rowStr(row.name),
        description: rowStr(row.description),
        isDefault: row.isdefault === true,
      }))
      .filter((v) => v.id)
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
      columns = Object.keys(rows[0]).filter((k) => !k.includes('@') && !k.startsWith('_'))

    // Best-effort total (same filter, aggregate count) — null for aggregate
    // queries; >50k rows throws and simply leaves the badge off (same
    // degradation as the Job Monitor).
    let totalCount: number | undefined
    const countXml = buildCountFetchXml(fetchXml, info.idAttr)
    if (countXml) {
      try {
        const countRows = await fetchXmlQuery(info.set, countXml, orgUrl)
        const value = countRows[0]?.[COUNT_ALIAS]
        totalCount = value === undefined || value === null ? undefined : rowNum(value)
      } catch (err) {
        console.warn('[transfer] preview count failed (ignored):', err)
      }
    }
    return { columns, rows, totalCount, limit: maxRows }
  }
}

export const dataverseTransferHubService: TransferHubService =
  new DataverseTransferHubService()
