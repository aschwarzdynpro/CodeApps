import type {
  EntityMeta,
  EntityRef,
  ODataQuery,
  OdataRow,
  QueryResult,
  RawAttribute,
  RecordDraft,
  WriteResult,
} from '../types/odataBrowser'
import type { OdataBrowserService } from './odataBrowserService'
import { classifyColumn, sortColumns } from '../utils/odataQuery'
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
    // The mock ignores $filter (that is P2) but honours ordering, projection
    // and paging so the grid, the "load more" path and the column picker all
    // behave like the real thing.
    let rows = [...seed.rows]
    for (const order of [...query.orderBy].reverse()) {
      rows.sort((a, b) => {
        const left = String(a[order.column] ?? '')
        const right = String(b[order.column] ?? '')
        return order.desc ? right.localeCompare(left) : left.localeCompare(right)
      })
    }
    const offset = skipToken ? Number(skipToken) || 0 : 0
    const size = Math.max(1, query.pageSize || rows.length)
    const page = rows.slice(offset, offset + size)
    rows = page.map((row) => project(row, query.select))
    const nextOffset = offset + size
    return {
      rows,
      skipToken: nextOffset < seed.rows.length ? String(nextOffset) : null,
      durationMs: 220,
    }
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
