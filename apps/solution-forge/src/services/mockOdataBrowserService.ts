import type {
  EntityMeta,
  EntityRef,
  FilterNode,
  ODataQuery,
  OdataRow,
  OptionLabel,
  QueryResult,
  RawAttribute,
  RecordDraft,
  WriteResult,
} from '../types/odataBrowser'
import type { OdataBrowserService } from './odataBrowserService'
import { classifyColumn, sortColumns } from '../utils/odataQuery'
import { operatorDef } from '../utils/odataFilter'
import { OdataQueryError } from '../utils/odataErrors'

/**
 * Mock implementation of {@link OdataBrowserService} — a small fake Dataverse
 * so the browser is fully demoable offline: three tables with a lookup, a
 * choice and system columns, and seeded rows that carry the same
 * **FormattedValue / lookuplogicalname annotations** the real Web API sends.
 * Without those the grid's display path would never be exercised in mock mode.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const FV = '@OData.Community.Display.V1.FormattedValue'
const LLN = '@Microsoft.Dynamics.CRM.lookuplogicalname'

function attr(
  logicalName: string,
  displayName: string,
  attributeType: string,
  extra: Partial<RawAttribute> = {},
): RawAttribute {
  return {
    logicalName,
    displayName,
    attributeType,
    attributeTypeName: '',
    attributeOf: null,
    isValidForRead: true,
    isValidForCreate: true,
    isValidForUpdate: true,
    isValidForAdvancedFind: true,
    isPrimaryId: false,
    isPrimaryName: false,
    ...extra,
  }
}

interface TableSeed {
  ref: EntityRef
  attributes: RawAttribute[]
  rows: OdataRow[]
}

function ref(
  logicalName: string,
  entitySet: string,
  displayName: string,
  displayCollectionName: string,
  primaryIdAttribute: string,
  primaryNameAttribute: string,
  objectTypeCode: number,
  isCustomEntity = false,
): EntityRef {
  return {
    logicalName,
    schemaName: logicalName.charAt(0).toUpperCase() + logicalName.slice(1),
    entitySet,
    displayName,
    displayCollectionName,
    primaryIdAttribute,
    primaryNameAttribute,
    objectTypeCode,
    isPrivate: false,
    isActivity: false,
    isCustomEntity,
    isManaged: !isCustomEntity,
  }
}

const ACCOUNTS: OdataRow[] = [
  {
    accountid: '11111111-1111-1111-1111-111111111101',
    name: 'Contoso Industries',
    revenue: 4200000,
    [`revenue${FV}`]: '€4,200,000.00',
    statecode: 0,
    [`statecode${FV}`]: 'Active',
    createdon: '2024-03-11T09:12:00Z',
    [`createdon${FV}`]: '11/03/2024 10:12',
    _primarycontactid_value: '22222222-2222-2222-2222-222222222201',
    [`_primarycontactid_value${FV}`]: 'Ada Lovelace',
    [`_primarycontactid_value${LLN}`]: 'contact',
  },
  {
    accountid: '11111111-1111-1111-1111-111111111102',
    name: 'Fabrikam Logistics',
    revenue: 875000,
    [`revenue${FV}`]: '€875,000.00',
    statecode: 0,
    [`statecode${FV}`]: 'Active',
    createdon: '2025-01-27T14:40:00Z',
    [`createdon${FV}`]: '27/01/2025 15:40',
    _primarycontactid_value: '22222222-2222-2222-2222-222222222202',
    [`_primarycontactid_value${FV}`]: 'Grace Hopper',
    [`_primarycontactid_value${LLN}`]: 'contact',
  },
  {
    accountid: '11111111-1111-1111-1111-111111111103',
    name: 'Northwind Traders',
    revenue: null,
    statecode: 1,
    [`statecode${FV}`]: 'Inactive',
    createdon: '2023-08-02T06:05:00Z',
    [`createdon${FV}`]: '02/08/2023 08:05',
  },
]

const CONTACTS: OdataRow[] = [
  {
    contactid: '22222222-2222-2222-2222-222222222201',
    fullname: 'Ada Lovelace',
    emailaddress1: 'ada@contoso.example',
    statecode: 0,
    [`statecode${FV}`]: 'Active',
    createdon: '2024-03-11T09:15:00Z',
    [`createdon${FV}`]: '11/03/2024 10:15',
    _parentcustomerid_value: '11111111-1111-1111-1111-111111111101',
    [`_parentcustomerid_value${FV}`]: 'Contoso Industries',
    [`_parentcustomerid_value${LLN}`]: 'account',
  },
  {
    contactid: '22222222-2222-2222-2222-222222222202',
    fullname: 'Grace Hopper',
    emailaddress1: 'grace@fabrikam.example',
    statecode: 0,
    [`statecode${FV}`]: 'Active',
    createdon: '2025-01-27T14:41:00Z',
    [`createdon${FV}`]: '27/01/2025 15:41',
    _parentcustomerid_value: '11111111-1111-1111-1111-111111111102',
    [`_parentcustomerid_value${FV}`]: 'Fabrikam Logistics',
    [`_parentcustomerid_value${LLN}`]: 'account',
  },
]

const WORKING_SOLUTIONS: OdataRow[] = [
  {
    pro_workingsolutionid: '33333333-3333-3333-3333-333333333301',
    pro_name: 'feature_invoice_split',
    pro_uniquesolutionname: 'feature_invoice_split',
    pro_deploymentstatus: 'In development',
    statecode: 0,
    [`statecode${FV}`]: 'Active',
    createdon: '2026-06-30T07:00:00Z',
    [`createdon${FV}`]: '30/06/2026 09:00',
  },
  {
    pro_workingsolutionid: '33333333-3333-3333-3333-333333333302',
    pro_name: 'deploy_sprint_12',
    pro_uniquesolutionname: 'deploy_sprint_12',
    pro_deploymentstatus: 'Deployment completed',
    statecode: 1,
    [`statecode${FV}`]: 'Inactive',
    createdon: '2026-07-14T11:30:00Z',
    [`createdon${FV}`]: '14/07/2026 13:30',
  },
]

const SEEDS: TableSeed[] = [
  {
    ref: ref(
      'account',
      'accounts',
      'Account',
      'Accounts',
      'accountid',
      'name',
      1,
    ),
    attributes: [
      attr('accountid', 'Account', 'Uniqueidentifier', { isPrimaryId: true }),
      attr('name', 'Account Name', 'String', { isPrimaryName: true }),
      attr('revenue', 'Annual Revenue', 'Money'),
      attr('statecode', 'Status', 'State'),
      attr('createdon', 'Created On', 'DateTime', { isValidForUpdate: false }),
      attr('primarycontactid', 'Primary Contact', 'Lookup'),
      attr('entityimage', 'Entity Image', 'Virtual', {
        attributeTypeName: 'ImageType',
      }),
      attr('revenue_base', 'Annual Revenue (Base)', 'Money', {
        attributeOf: 'revenue',
      }),
    ],
    rows: ACCOUNTS,
  },
  {
    ref: ref(
      'contact',
      'contacts',
      'Contact',
      'Contacts',
      'contactid',
      'fullname',
      2,
    ),
    attributes: [
      attr('contactid', 'Contact', 'Uniqueidentifier', { isPrimaryId: true }),
      attr('fullname', 'Full Name', 'String', {
        isPrimaryName: true,
        isValidForUpdate: false,
      }),
      attr('emailaddress1', 'Email', 'String'),
      attr('statecode', 'Status', 'State'),
      attr('createdon', 'Created On', 'DateTime', { isValidForUpdate: false }),
      attr('parentcustomerid', 'Company Name', 'Customer'),
    ],
    rows: CONTACTS,
  },
  {
    ref: ref(
      'pro_workingsolution',
      'pro_workingsolutions',
      'Working Solution',
      'Working Solutions',
      'pro_workingsolutionid',
      'pro_name',
      10123,
      true,
    ),
    attributes: [
      attr('pro_workingsolutionid', 'Working Solution', 'Uniqueidentifier', {
        isPrimaryId: true,
      }),
      attr('pro_name', 'Name', 'String', { isPrimaryName: true }),
      attr('pro_uniquesolutionname', 'Unique Solution Name', 'String'),
      attr('pro_deploymentstatus', 'Deployment Status', 'String'),
      attr('statecode', 'Status', 'State'),
      attr('createdon', 'Created On', 'DateTime', { isValidForUpdate: false }),
    ],
    rows: WORKING_SOLUTIONS,
  },
]

/**
 * Evaluate the structured filter against the seeded rows. The mock cannot
 * interpret an OData expression, but it *can* walk the tree the builder
 * produced — enough to make filtering genuinely work offline for the common
 * operators. Anything else (raw filters, CRM date functions) is treated as
 * "matches", so a demo never silently shows an empty grid.
 */
function matches(row: OdataRow, node: FilterNode): boolean {
  if (node.kind === 'group') {
    const children = node.children.filter((c) => renderable(c))
    if (children.length === 0) return true
    return node.op === 'and'
      ? children.every((c) => matches(row, c))
      : children.some((c) => matches(row, c))
  }
  const raw = row[node.column]
  const text = raw === null || raw === undefined ? '' : String(raw)
  const needle = (node.values[0] ?? '').trim()
  switch (node.operator) {
    case 'eq':
      return text.toLowerCase() === needle.toLowerCase()
    case 'ne':
      return text.toLowerCase() !== needle.toLowerCase()
    case 'contains':
      return text.toLowerCase().includes(needle.toLowerCase())
    case 'notcontains':
      return !text.toLowerCase().includes(needle.toLowerCase())
    case 'startswith':
      return text.toLowerCase().startsWith(needle.toLowerCase())
    case 'endswith':
      return text.toLowerCase().endsWith(needle.toLowerCase())
    case 'null':
      return text === ''
    case 'notnull':
      return text !== ''
    case 'gt':
      return Number(text) > Number(needle)
    case 'ge':
      return Number(text) >= Number(needle)
    case 'lt':
      return Number(text) < Number(needle)
    case 'le':
      return Number(text) <= Number(needle)
    default:
      return true
  }
}

/** A condition only counts once it carries what its operator needs. */
function renderable(node: FilterNode): boolean {
  if (node.kind === 'group') return node.children.some(renderable)
  if (!node.column) return false
  const def = operatorDef(node.operator)
  if (!def) return false
  if (def.arity === 0) return true
  return node.values.some((v) => v.trim() !== '')
}

/** Keep only the selected columns (plus their annotations) on a row. */
function project(row: OdataRow, select: string[]): OdataRow {
  if (select.length === 0) return row
  const keep = new Set(select)
  const out: OdataRow = {}
  for (const [key, value] of Object.entries(row)) {
    const base = key.includes('@') ? key.slice(0, key.indexOf('@')) : key
    if (base === '' || keep.has(base)) out[key] = value
  }
  return out
}

class MockOdataBrowserService implements OdataBrowserService {
  async listEntities(_envKey: string): Promise<EntityRef[]> {
    void _envKey
    await delay(180)
    return SEEDS.map((s) => s.ref).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    )
  }

  async getEntityMeta(
    _envKey: string,
    logicalName: string,
  ): Promise<EntityMeta> {
    void _envKey
    await delay(150)
    const seed = SEEDS.find((s) => s.ref.logicalName === logicalName)
    if (!seed)
      throw new OdataQueryError(`Table “${logicalName}” is not in the mock.`)
    return {
      ref: seed.ref,
      columns: sortColumns(seed.attributes.map(classifyColumn)),
    }
  }

  async runQuery(
    _envKey: string,
    query: ODataQuery,
    skipToken: string | null = null,
  ): Promise<QueryResult> {
    void _envKey
    await delay(220)
    const seed = SEEDS.find((s) => s.ref.entitySet === query.entitySet)
    if (!seed)
      throw new OdataQueryError(
        `No HTTP resource was found that matches “${query.entitySet}”.`,
        'The mock only knows accounts, contacts and pro_workingsolutions.',
      )
    // Filtering, ordering, projection and paging all behave like the real
    // thing, so the builder, the column picker and "load more" are genuinely
    // demoable offline. Only a *raw* filter is beyond the mock (it would have
    // to interpret OData text) — those rows come back unfiltered.
    const rows = query.filter
      ? seed.rows.filter((row) => matches(row, query.filter as FilterNode))
      : [...seed.rows]
    for (const order of [...query.orderBy].reverse()) {
      rows.sort((a, b) => {
        const left = String(a[order.column] ?? '')
        const right = String(b[order.column] ?? '')
        return order.desc ? right.localeCompare(left) : left.localeCompare(right)
      })
    }
    const total = rows.length
    const offset = skipToken ? Number(skipToken) || 0 : 0
    const size = Math.max(1, query.pageSize || total)
    const page = rows.slice(offset, offset + size)
    const nextOffset = offset + size
    return {
      rows: page.map((row) => project(row, query.select)),
      skipToken: nextOffset < total ? String(nextOffset) : null,
      durationMs: 220,
    }
  }

  async listOptions(
    _envKey: string,
    objectTypeCode: number,
    attributeLogicalName: string,
  ): Promise<OptionLabel[]> {
    void _envKey
    await delay(120)
    if (attributeLogicalName !== 'statecode') return []
    void objectTypeCode
    return [
      { value: 0, label: 'Active' },
      { value: 1, label: 'Inactive' },
    ]
  }

  async countRows(
    _envKey: string,
    entitySet: string,
    _fetchXml: string,
  ): Promise<number | 'over-limit'> {
    void _envKey
    void _fetchXml
    await delay(160)
    // The mock cannot run FetchXML — report the seeded size of the table so
    // the button is demoable, without pretending the filter was applied.
    const seed = SEEDS.find((s) => s.ref.entitySet === entitySet)
    return seed ? seed.rows.length : 0
  }

  refreshMetadata(_envKey: string): void {
    void _envKey
  }

  async createRecord(
    _envKey: string,
    _draft: RecordDraft,
  ): Promise<WriteResult> {
    void _envKey
    void _draft
    throw new OdataQueryError('OData Browser write mode is disabled.')
  }

  async updateRecord(
    _envKey: string,
    _draft: RecordDraft,
  ): Promise<WriteResult> {
    void _envKey
    void _draft
    throw new OdataQueryError('OData Browser write mode is disabled.')
  }

  async deleteRecord(
    _envKey: string,
    _entitySet: string,
    _recordId: string,
  ): Promise<WriteResult> {
    void _envKey
    void _entitySet
    void _recordId
    throw new OdataQueryError('OData Browser write mode is disabled.')
  }
}

export const mockOdataBrowserService: OdataBrowserService =
  new MockOdataBrowserService()
