import type {
  AttributeChange,
  AuditEvent,
  AuditOperation,
  AuditUser,
} from '../types/audit'

/**
 * Deterministic sample audit log. A seeded RNG keeps the data stable across
 * reloads so drill-down links remain consistent. The records mirror the shape
 * of the Dataverse `audit` table joined with resolved attribute changes.
 */

// --- tiny seeded RNG (mulberry32) ---------------------------------------
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20260609)
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const chance = (p: number) => rand() < p

// --- reference data ------------------------------------------------------
const USERS: AuditUser[] = [
  { name: 'Mara Klein', initials: 'MK' },
  { name: 'Tom Berger', initials: 'TB' },
  { name: 'Sofia Reyes', initials: 'SR' },
  { name: 'Jonas Weiß', initials: 'JW' },
  { name: 'Aisha Noor', initials: 'AN' },
  { name: 'System', initials: 'SY' },
]

interface TableDef {
  name: string
  logical: string
  records: string[]
  attributes: { label: string; values: string[] }[]
}

const TABLES: TableDef[] = [
  {
    name: 'Account',
    logical: 'account',
    records: ['Contoso Ltd', 'Fabrikam Inc', 'Northwind Traders', 'Adventure Works', 'Tailspin Toys'],
    attributes: [
      { label: 'Account Name', values: ['Contoso Ltd', 'Contoso Limited', 'Contoso GmbH'] },
      { label: 'Industry', values: ['Manufacturing', 'Retail', 'Financial Services', 'Healthcare'] },
      { label: 'Annual Revenue', values: ['1,200,000', '2,450,000', '980,000', '5,000,000'] },
      { label: 'Main Phone', values: ['+49 30 123456', '+49 89 998877', '+1 425 555 0100'] },
      { label: 'City', values: ['Berlin', 'Munich', 'Hamburg', 'Seattle'] },
      { label: 'Credit Limit', values: ['50,000', '75,000', '120,000'] },
    ],
  },
  {
    name: 'Contact',
    logical: 'contact',
    records: ['Laura Schmidt', 'Marco Rossi', 'Yuki Tanaka', 'Ahmed Hassan', 'Greta Olsen'],
    attributes: [
      { label: 'Job Title', values: ['Buyer', 'Procurement Lead', 'CFO', 'Operations Manager'] },
      { label: 'Email', values: ['laura.schmidt@contoso.com', 'l.schmidt@contoso.com'] },
      { label: 'Business Phone', values: ['+49 40 222111', '+49 40 222999'] },
      { label: 'Preferred Method', values: ['Email', 'Phone', 'Any'] },
    ],
  },
  {
    name: 'Opportunity',
    logical: 'opportunity',
    records: ['Q3 Hardware Refresh', 'Cloud Migration', 'Support Renewal', 'New Plant Rollout'],
    attributes: [
      { label: 'Est. Revenue', values: ['85,000', '120,000', '64,500', '210,000'] },
      { label: 'Stage', values: ['Qualify', 'Develop', 'Propose', 'Close'] },
      { label: 'Probability', values: ['25%', '50%', '75%', '90%'] },
      { label: 'Est. Close Date', values: ['2026-08-15', '2026-09-30', '2026-07-31'] },
    ],
  },
  {
    name: 'Case',
    logical: 'incident',
    records: ['Login fails after update', 'Invoice mismatch', 'Slow report load', 'Export error'],
    attributes: [
      { label: 'Priority', values: ['Low', 'Normal', 'High'] },
      { label: 'Status', values: ['Active', 'On Hold', 'Resolved'] },
      { label: 'Subject', values: ['Technical', 'Billing', 'Performance'] },
    ],
  },
  {
    name: 'Lead',
    logical: 'lead',
    records: ['Website inquiry – Acme', 'Trade fair contact', 'Referral – Globex'],
    attributes: [
      { label: 'Rating', values: ['Hot', 'Warm', 'Cold'] },
      { label: 'Status', values: ['New', 'Contacted', 'Qualified'] },
      { label: 'Company', values: ['Acme Corp', 'Globex', 'Initech'] },
    ],
  },
]

const OPERATIONS: { op: AuditOperation; weight: number }[] = [
  { op: 'Update', weight: 0.58 },
  { op: 'Create', weight: 0.24 },
  { op: 'Delete', weight: 0.08 },
  { op: 'Access', weight: 0.1 },
]

function pickOperation(): AuditOperation {
  const r = rand()
  let acc = 0
  for (const { op, weight } of OPERATIONS) {
    acc += weight
    if (r <= acc) return op
  }
  return 'Update'
}

function buildChanges(table: TableDef, op: AuditOperation): AttributeChange[] {
  if (op === 'Delete' || op === 'Access') return []
  const count = op === 'Create' ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3)
  const attrs = [...table.attributes].sort(() => rand() - 0.5).slice(0, count)
  return attrs.map((a) => {
    const newValue = pick(a.values)
    const oldValue =
      op === 'Create'
        ? ''
        : pick(a.values.filter((v) => v !== newValue).concat(a.values))
    return { attribute: a.label, oldValue, newValue }
  })
}

// Base "now" matches the demo's current date for sensible relative buckets.
const NOW = new Date('2026-06-09T17:00:00')

function generate(count: number): AuditEvent[] {
  const events: AuditEvent[] = []
  for (let i = 0; i < count; i++) {
    const table = pick(TABLES)
    const op = pickOperation()
    // Spread across the last 30 days, weighted toward recent days.
    const daysAgo = Math.floor(Math.pow(rand(), 1.6) * 30)
    const created = new Date(NOW)
    created.setDate(created.getDate() - daysAgo)
    created.setHours(8 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0)
    // "System" only performs Create/Update in this sample.
    const user = chance(0.12) ? USERS[5] : pick(USERS.slice(0, 5))
    events.push({
      id: `AUD-${(10000 + i).toString()}`,
      createdOn: created.toISOString(),
      operation: op,
      tableName: table.name,
      tableLogicalName: table.logical,
      recordId: `${table.logical}-${1000 + Math.floor(rand() * 50)}`,
      recordName: pick(table.records),
      user,
      changes: buildChanges(table, op),
    })
  }
  return events.sort(
    (a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime(),
  )
}

export const mockAuditEvents: AuditEvent[] = generate(160)
