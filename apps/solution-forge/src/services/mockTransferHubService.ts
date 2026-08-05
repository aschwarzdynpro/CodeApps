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
import type { CreateRunOptions, TransferHubService } from './transferHubService'
import { fetchTop, fetchXmlAttributes, type ColumnPlan } from '../utils/transferConfig'

/**
 * Offline mock of {@link TransferHubService} — the full hub is demoable
 * without a Power Platform host: seeded packages/entries covering every mode
 * (view snapshot + GUID upsert, FetchXML + match columns + deactivate,
 * FetchXML + delete), plus small per-table metadata so the entry dialog's
 * pickers and preview work. Mutations change module state (session-scoped).
 */

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const PAYMENTTERM_VIEW_XML = `<fetch><entity name="cust_paymentterm"><attribute name="cust_name"/><attribute name="cust_code"/><attribute name="cust_days"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter><order attribute="cust_name"/></entity></fetch>`
const PRICELIST_XML = `<fetch><entity name="cust_pricelist"><attribute name="cust_name"/><attribute name="cust_code"/><attribute name="cust_currency"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>`
const PRICELISTITEM_XML = `<fetch><entity name="cust_pricelistitem"><attribute name="cust_name"/><attribute name="cust_pricelistid"/><attribute name="cust_amount"/><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>`

const TABLES: TableRef[] = [
  { logicalName: 'account', displayName: 'Account', displayCollectionName: 'Accounts', entitySet: 'accounts', primaryIdAttribute: 'accountid' },
  { logicalName: 'contact', displayName: 'Contact', displayCollectionName: 'Contacts', entitySet: 'contacts', primaryIdAttribute: 'contactid' },
  { logicalName: 'cust_paymentterm', displayName: 'Payment Term', displayCollectionName: 'Payment Terms', entitySet: 'cust_paymentterms', primaryIdAttribute: 'cust_paymenttermid' },
  { logicalName: 'cust_pricelist', displayName: 'Price List', displayCollectionName: 'Price Lists', entitySet: 'cust_pricelists', primaryIdAttribute: 'cust_pricelistid' },
  { logicalName: 'cust_pricelistitem', displayName: 'Price List Item', displayCollectionName: 'Price List Items', entitySet: 'cust_pricelistitems', primaryIdAttribute: 'cust_pricelistitemid' },
]

const VIEWS: Record<string, SavedViewRef[]> = {
  cust_paymentterm: [
    { id: 'mock-view-terms-active', name: 'Active Payment Terms', description: 'Active rows only', isDefault: true },
    { id: 'mock-view-terms-all', name: 'All Payment Terms', description: '', isDefault: false },
  ],
  cust_pricelist: [
    { id: 'mock-view-pricelists', name: 'Active Price Lists', description: '', isDefault: true },
  ],
  account: [{ id: 'mock-view-accounts', name: 'Active Accounts', description: '', isDefault: true }],
  contact: [{ id: 'mock-view-contacts', name: 'Active Contacts', description: '', isDefault: true }],
}

const VIEW_XML: Record<string, { name: string; fetchXml: string }> = {
  'mock-view-terms-active': { name: 'Active Payment Terms', fetchXml: PAYMENTTERM_VIEW_XML },
  'mock-view-terms-all': {
    name: 'All Payment Terms',
    fetchXml: PAYMENTTERM_VIEW_XML.replace('<filter><condition attribute="statecode" operator="eq" value="0"/></filter>', ''),
  },
  'mock-view-pricelists': { name: 'Active Price Lists', fetchXml: PRICELIST_XML },
}

const COLUMNS: Record<string, ColumnRef[]> = {
  cust_paymentterm: [
    { logicalName: 'cust_code', displayName: 'Code', attributeType: 'String' },
    { logicalName: 'cust_days', displayName: 'Days', attributeType: 'Integer' },
    { logicalName: 'cust_name', displayName: 'Name', attributeType: 'String' },
    { logicalName: 'cust_paymenttermid', displayName: 'Payment Term', attributeType: 'Uniqueidentifier' },
    { logicalName: 'statecode', displayName: 'Status', attributeType: 'State' },
  ],
  cust_pricelist: [
    { logicalName: 'cust_code', displayName: 'Code', attributeType: 'String' },
    { logicalName: 'cust_currency', displayName: 'Currency', attributeType: 'String' },
    { logicalName: 'cust_name', displayName: 'Name', attributeType: 'String' },
  ],
  cust_pricelistitem: [
    { logicalName: 'cust_amount', displayName: 'Amount', attributeType: 'Money' },
    { logicalName: 'cust_name', displayName: 'Name', attributeType: 'String' },
    { logicalName: 'cust_pricelistid', displayName: 'Price List', attributeType: 'Lookup' },
  ],
}

let seq = 100
const nextId = (prefix: string) => `mock-${prefix}-${seq++}`

/** Simplified column-plan computation mirroring the dataverse service. */
const MOCK_LOOKUP_SETS: Record<string, string> = { cust_pricelistid: 'cust_pricelists' }
function mockColumnPlan(table: string, fetchXml: string): string {
  const attrs = fetchXmlAttributes(fetchXml)
  const meta = COLUMNS[table] ?? []
  const plan = { s: [] as string[], l: [] as { c: string; s: string }[], x: [] as { c: string; r: string }[] }
  for (const col of attrs) {
    const m = meta.find((c) => c.logicalName === col)
    if (!m) plan.x.push({ c: col, r: 'not in metadata' })
    else if (m.attributeType === 'Uniqueidentifier')
      plan.x.push({ c: col, r: 'primary id (written on create)' })
    else if (m.attributeType === 'State') plan.x.push({ c: col, r: 'platform' })
    else if (m.attributeType === 'Lookup') {
      const set = MOCK_LOOKUP_SETS[col]
      if (set) plan.l.push({ c: col, s: set })
      else plan.x.push({ c: col, r: 'lookup target unknown' })
    } else plan.s.push(col)
  }
  return JSON.stringify(plan)
}

const packages: TransferPackage[] = [
  {
    id: 'mock-pkg-1',
    name: 'Base configuration data',
    description: 'Payment terms + price lists the business maintains in DEV.',
    targetEnvKeys: ['uat', 'prod'],
    order: 1,
    active: true,
    // Runs itself every night — shows the schedule chip offline.
    recurrence: 'daily',
    nextRun: '2026-07-24T02:00:00Z',
    modifiedOn: '2026-07-20T09:30:00Z',
  },
  {
    id: 'mock-pkg-2',
    name: 'Feature toggles',
    description: 'Currently paused — kept for the next wave.',
    targetEnvKeys: ['uat'],
    order: 2,
    active: false,
    recurrence: 'none',
    nextRun: '',
    modifiedOn: '2026-06-30T14:00:00Z',
  },
]

const entries: TransferEntry[] = [
  {
    id: 'mock-entry-1',
    packageId: 'mock-pkg-1',
    name: 'Payment terms',
    sourceEnvKey: 'dev',
    tableLogicalName: 'cust_paymentterm',
    tableDisplayName: 'Payment Term',
    entitySet: 'cust_paymentterms',
    primaryIdAttribute: 'cust_paymenttermid',
    queryMode: 'view',
    viewId: 'mock-view-terms-active',
    viewName: 'Active Payment Terms',
    viewSnapshotAt: '2026-07-18T08:00:00Z',
    fetchXml: PAYMENTTERM_VIEW_XML,
    matchMode: 'guid',
    matchColumns: [],
    orphanHandling: 'ignore',
    order: 1,
    notes: '',
    active: true,
    columnPlan: '{"s":["cust_name","cust_code","cust_days"],"l":[],"x":[]}',
  },
  {
    id: 'mock-entry-2',
    packageId: 'mock-pkg-1',
    name: 'Price lists',
    sourceEnvKey: 'dev',
    tableLogicalName: 'cust_pricelist',
    tableDisplayName: 'Price List',
    entitySet: 'cust_pricelists',
    primaryIdAttribute: 'cust_pricelistid',
    queryMode: 'fetchxml',
    viewId: '',
    viewName: '',
    viewSnapshotAt: '',
    fetchXml: PRICELIST_XML,
    matchMode: 'columns',
    matchColumns: ['cust_code'],
    orphanHandling: 'deactivate',
    order: 2,
    notes: 'Matched by code — target ids differ historically.',
    active: true,
    columnPlan: '{"s":["cust_name","cust_code","cust_currency"],"l":[],"x":[]}',
  },
  {
    id: 'mock-entry-3',
    packageId: 'mock-pkg-1',
    name: 'Price list items',
    sourceEnvKey: 'dev',
    tableLogicalName: 'cust_pricelistitem',
    tableDisplayName: 'Price List Item',
    entitySet: 'cust_pricelistitems',
    primaryIdAttribute: 'cust_pricelistitemid',
    queryMode: 'fetchxml',
    viewId: '',
    viewName: '',
    viewSnapshotAt: '',
    fetchXml: PRICELISTITEM_XML,
    matchMode: 'guid',
    matchColumns: [],
    orphanHandling: 'delete',
    order: 3,
    notes: 'After price lists — the lookup needs its parent first.',
    active: true,
    columnPlan:
      '{"s":["cust_name","cust_amount"],"l":[{"c":"cust_pricelistid","s":"cust_pricelists"}],"x":[]}',
  },
]

const runs: TransferRun[] = [
  {
    id: 'mock-run-1',
    packageId: 'mock-pkg-1',
    name: 'Base configuration data — 2026-07-21 06:30 UTC',
    status: 'succeeded',
    targetEnvKeys: ['uat', 'prod'],
    scheduledFor: '',
    requestedOn: '2026-07-21T06:30:00Z',
    requestedBy: 'Andy Schwarz',
    startedOn: '2026-07-21T06:31:12Z',
    finishedOn: '2026-07-21T06:33:40Z',
    summary: '3 entries × 2 targets — 405 upserted, 2 deactivated, 0 errors',
    log: JSON.stringify(
      [
        { entry: 'Payment terms', target: 'uat', created: 0, updated: 42, errors: [] },
        { entry: 'Payment terms', target: 'prod', created: 0, updated: 42, errors: [] },
        { entry: 'Price lists', target: 'uat', created: 1, updated: 6, deactivated: 2, errors: [] },
      ],
      null,
      2,
    ),
    dryRun: false,
  },
]

function withCounts(list: TransferPackage[]): TransferPackage[] {
  return list.map((p) => ({
    ...p,
    entryCount: entries.filter((e) => e.packageId === p.id).length,
  }))
}

class MockTransferHubService implements TransferHubService {
  async listPackages(): Promise<TransferPackage[]> {
    await delay(200)
    return withCounts(
      [...packages].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    )
  }

  async createPackage(input: TransferPackageInput): Promise<TransferPackage> {
    await delay(150)
    const pkg: TransferPackage = {
      id: nextId('pkg'),
      name: input.name,
      description: input.description,
      targetEnvKeys: [...input.targetEnvKeys],
      order: input.order,
      active: true,
      recurrence: input.recurrence,
      nextRun: input.recurrence === 'none' ? '' : input.nextRun,
      entryCount: 0,
      modifiedOn: new Date().toISOString(),
    }
    packages.push(pkg)
    return pkg
  }

  async updatePackage(id: string, input: TransferPackageInput): Promise<void> {
    await delay(150)
    const pkg = packages.find((p) => p.id === id)
    if (!pkg) throw new Error('Package not found.')
    Object.assign(pkg, {
      name: input.name,
      description: input.description,
      targetEnvKeys: [...input.targetEnvKeys],
      order: input.order,
      recurrence: input.recurrence,
      nextRun: input.recurrence === 'none' ? '' : input.nextRun,
      modifiedOn: new Date().toISOString(),
    })
  }

  async deletePackage(id: string): Promise<void> {
    await delay(150)
    const idx = packages.findIndex((p) => p.id === id)
    if (idx >= 0) packages.splice(idx, 1)
    for (let i = entries.length - 1; i >= 0; i--)
      if (entries[i].packageId === id) entries.splice(i, 1)
  }

  async setPackageActive(id: string, active: boolean): Promise<void> {
    await delay(100)
    const pkg = packages.find((p) => p.id === id)
    if (pkg) pkg.active = active
  }

  async listEntries(packageId: string): Promise<TransferEntry[]> {
    await delay(200)
    return entries
      .filter((e) => e.packageId === packageId)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((e) => ({ ...e }))
  }

  async createEntry(input: TransferEntryInput): Promise<TransferEntry> {
    await delay(150)
    const entry: TransferEntry = {
      ...input,
      id: nextId('entry'),
      active: true,
      columnPlan: mockColumnPlan(input.tableLogicalName, input.fetchXml),
    }
    entries.push(entry)
    return { ...entry }
  }

  async updateEntry(id: string, input: TransferEntryInput): Promise<void> {
    await delay(150)
    const entry = entries.find((e) => e.id === id)
    if (!entry) throw new Error('Entry not found.')
    Object.assign(entry, input, {
      columnPlan: mockColumnPlan(input.tableLogicalName, input.fetchXml),
    })
  }

  async deleteEntry(id: string): Promise<void> {
    await delay(150)
    const idx = entries.findIndex((e) => e.id === id)
    if (idx >= 0) entries.splice(idx, 1)
  }

  async setEntryActive(id: string, active: boolean): Promise<void> {
    await delay(100)
    const entry = entries.find((e) => e.id === id)
    if (entry) entry.active = active
  }

  async reorderEntries(orderedIds: string[]): Promise<void> {
    await delay(100)
    orderedIds.forEach((id, i) => {
      const entry = entries.find((e) => e.id === id)
      if (entry) entry.order = i + 1
    })
  }

  async refreshViewSnapshot(entryId: string): Promise<TransferEntry> {
    await delay(250)
    const entry = entries.find((e) => e.id === entryId)
    if (!entry) throw new Error('Entry not found.')
    const view = VIEW_XML[entry.viewId]
    if (!view) throw new Error('The saved view no longer exists in the source environment.')
    entry.fetchXml = view.fetchXml
    entry.viewName = view.name
    entry.viewSnapshotAt = new Date().toISOString()
    entry.columnPlan = mockColumnPlan(entry.tableLogicalName, view.fetchXml)
    return { ...entry }
  }

  async createRun(pkg: TransferPackage, opts: CreateRunOptions = {}): Promise<TransferRun> {
    await delay(200)
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const run: TransferRun = {
      id: nextId('run'),
      packageId: pkg.id,
      name: `${opts.dryRun ? 'DRY RUN — ' : ''}${pkg.name} — ${stamp} UTC`,
      status: opts.scheduledFor ? 'scheduled' : 'queued',
      targetEnvKeys: [...pkg.targetEnvKeys],
      scheduledFor: opts.scheduledFor ?? '',
      requestedOn: new Date().toISOString(),
      requestedBy: 'You',
      startedOn: '',
      finishedOn: '',
      summary: '',
      log: '',
      dryRun: opts.dryRun === true,
    }
    runs.unshift(run)
    return { ...run }
  }

  async cancelRun(id: string): Promise<void> {
    await delay(100)
    const run = runs.find((r) => r.id === id)
    if (run && (run.status === 'queued' || run.status === 'scheduled')) run.status = 'cancelled'
  }

  async listRuns(packageId: string, top = 20): Promise<TransferRun[]> {
    await delay(200)
    return runs
      .filter((r) => r.packageId === packageId)
      .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn))
      .slice(0, top)
      .map((r) => ({ ...r }))
  }

  async listTables(_envKey: string): Promise<TableRef[]> {
    void _envKey
    await delay(300)
    return TABLES
  }

  async listViews(_envKey: string, tableLogicalName: string): Promise<SavedViewRef[]> {
    void _envKey
    await delay(200)
    return VIEWS[tableLogicalName] ?? []
  }

  async getViewFetchXml(
    _envKey: string,
    viewId: string,
  ): Promise<{ name: string; fetchXml: string }> {
    void _envKey
    await delay(200)
    const view = VIEW_XML[viewId]
    if (!view) throw new Error('The saved view no longer exists in the source environment.')
    return { ...view }
  }

  async listColumns(_envKey: string, tableLogicalName: string): Promise<ColumnRef[]> {
    void _envKey
    await delay(200)
    return COLUMNS[tableLogicalName] ?? []
  }

  async preview(
    _envKey: string,
    tableLogicalName: string,
    fetchXml: string,
    maxRows = 25,
  ): Promise<PreviewResult> {
    void _envKey
    await delay(400)
    const columns = fetchXmlAttributes(fetchXml)
    const cols =
      columns.length > 0
        ? columns
        : (COLUMNS[tableLogicalName] ?? []).map((c) => c.logicalName)
    if (cols.length === 0) throw new Error('Nothing to preview — the query selects no columns.')
    const top = fetchTop(fetchXml)
    const total = top !== null ? Math.min(42, top) : 42
    const rows = Array.from({ length: Math.min(total, maxRows, 8) }, (_, i) => {
      const row: Record<string, unknown> = {}
      for (const col of cols) {
        if (col.endsWith('id')) row[col] = `0000000${i}-mock-guid`
        else if (col.includes('amount') || col.includes('days')) row[col] = (i + 1) * 10
        else row[col] = `${tableLogicalName.replace(/^\w+_/, '')} ${col.replace(/^\w+_/, '')} ${i + 1}`
      }
      return row
    })
    return { columns: cols, rows, totalCount: total, limit: maxRows }
  }

  async countRows(
    _envKey: string,
    tableLogicalName: string,
    fetchXml: string,
  ): Promise<number | undefined> {
    void _envKey
    await delay(300)
    const seeded: Record<string, number> = {
      cust_paymentterm: 42,
      cust_pricelist: 7,
      cust_pricelistitem: 356,
    }
    const count = seeded[tableLogicalName] ?? 12
    const top = fetchTop(fetchXml)
    return top !== null ? Math.min(count, top) : count
  }

  async previewColumnPlan(
    _envKey: string,
    tableLogicalName: string,
    fetchXml: string,
  ): Promise<ColumnPlan | null> {
    void _envKey
    await delay(200)
    // Same helper the mock's create/update use — the dialog and the stored
    // recipe agree offline exactly as they do against a real environment.
    return JSON.parse(mockColumnPlan(tableLogicalName, fetchXml)) as ColumnPlan
  }
}

export const mockTransferHubService: TransferHubService = new MockTransferHubService()
