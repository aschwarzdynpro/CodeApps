import { ORG_URL } from '../config'
import { isPrivilegeMessage, PrivilegeError } from './calendarService'

/**
 * The Dataverse connector (`shared_commondataserviceforapps`, user
 * connection) without a compile-time dependency on `src/generated/`.
 *
 * The generated client is gitignored and environment-specific; loading it
 * through `import.meta.glob` keeps `npm run build` green on a fresh clone
 * (the glob is simply empty) and lets "Einrichtung" say what is missing
 * instead of the build failing with "Cannot find module" (pattern from
 * translation-studio).
 *
 * Connector rules we follow (solution-forge gotchas #4 and #8): always the
 * `…WithOrganization` variants with the org URL, formatted values only with
 * the `odata.include-annotations` prefer header, lookups come back as
 * `_x_value`, and `PerformUnboundActionWithOrganization` can only call
 * actions (POST) — never GET functions.
 */

type OperationResult = { success?: boolean; data?: unknown; error?: unknown }
type Operation = (...args: unknown[]) => Promise<OperationResult>
type ServiceModule = Record<string, Record<string, Operation> | undefined>

const modules = import.meta.glob<ServiceModule>('../generated/services/*Service.ts', { eager: true })

export const CONNECTOR_SERVICE = 'MicrosoftDataverseService'

function connectorService(): Record<string, Operation> | null {
  for (const [path, mod] of Object.entries(modules)) {
    if (path.endsWith(`/${CONNECTOR_SERVICE}.ts`)) return mod[CONNECTOR_SERVICE] ?? null
  }
  return null
}

export const hasConnector = (): boolean => connectorService() !== null

export class DataverseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataverseError'
  }
}

export function errorText(err: unknown): string {
  if (!err) return 'unbekannter Fehler'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  const e = err as { message?: unknown; error?: { message?: unknown } }
  if (typeof e.message === 'string') return e.message
  if (typeof e.error?.message === 'string') return e.error.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function connector(): Record<string, Operation> {
  const svc = connectorService()
  if (!svc) throw new DataverseError('Der Dataverse-Konnektor ist nicht eingebunden (src/generated fehlt — README „Einrichtung“).')
  if (!ORG_URL) throw new DataverseError('VITE_ORG_URL ist nicht gesetzt (.env beim Build).')
  return svc
}

async function run(op: Operation | undefined, what: string, args: unknown[]): Promise<unknown> {
  if (typeof op !== 'function') throw new DataverseError(`${what}: Operation im Konnektor nicht vorhanden.`)
  let res: OperationResult
  try {
    res = await op(...args)
  } catch (err) {
    throw toError(what, err)
  }
  if (res && res.success === false) throw toError(what, res.error)
  return res?.data ?? null
}

function toError(what: string, err: unknown): Error {
  const text = `${what}: ${errorText(err)}`
  return isPrivilegeMessage(text) ? new PrivilegeError(text) : new DataverseError(text)
}

export type Row = Record<string, unknown>

export const FV = '@OData.Community.Display.V1.FormattedValue'
const ANNOTATIONS = 'odata.include-annotations="*"'

const rowsOf = (data: unknown): Row[] => ((data as { value?: Row[] } | null)?.value ?? []) as Row[]

export interface ODataQuery {
  select: string
  filter?: string
  expand?: string
  orderBy?: string
  top?: number
  /** Request formatted values (lookup names, choice labels). */
  annotations?: boolean
}

/**
 * `ListRecordsWithOrganization(organization, entityName, prefer, accept, metadataFull, mipLabel, $select, $filter, $orderby, $expand, fetchXml, $top)`
 * — positional parameters of the generated connector client.
 *
 * Collection-valued `$expand` comes back empty for some tables (live:
 * `calendars?$filter=…&$expand=calendar_calendar_rules` returns `[]` plus a
 * nextLink) — read those rows one by one with `getRow`.
 */
export async function odata(entitySet: string, q: ODataQuery): Promise<Row[]> {
  const svc = connector()
  const data = await run(svc.ListRecordsWithOrganization, `${entitySet} lesen`, [ORG_URL, entitySet, q.annotations ? ANNOTATIONS : undefined, undefined, undefined, undefined, q.select, q.filter, q.orderBy, q.expand, undefined, q.top])
  return rowsOf(data)
}

/**
 * One row with `$expand` — `GetItemWithOrganization(prefer, accept, organization, entityName, recordId, metadataFull, mipLabel, $select, $expand)`.
 * Null when the row doesn't exist (any other error throws).
 */
export async function getRow(entitySet: string, id: string, q: Omit<ODataQuery, 'filter' | 'orderBy' | 'top'>): Promise<Row | null> {
  const svc = connector()
  try {
    return (await run(svc.GetItemWithOrganization, `${entitySet}(${id}) lesen`, [q.annotations ? ANNOTATIONS : 'return=representation', 'application/json', ORG_URL, entitySet, id, undefined, undefined, q.select, q.expand])) as Row | null
  } catch (err) {
    if (/does not exist|not found|404|0x80040217/i.test(errorText(err))) return null
    throw err
  }
}

/** `fn` over `items` with at most `limit` calls in flight; results in input order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** FetchXML read (11th parameter), e.g. for aggregates. */
export async function fetchXml(entitySet: string, xml: string, annotations = false): Promise<Row[]> {
  const svc = connector()
  const data = await run(svc.ListRecordsWithOrganization, `${entitySet} (FetchXML) lesen`, [ORG_URL, entitySet, annotations ? ANNOTATIONS : undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, xml])
  return rowsOf(data)
}

/** Unbound action (POST). Parameters as the Power Automate action "Perform an unbound action" takes them. */
export async function unboundAction(name: string, params: Record<string, unknown>): Promise<Row | null> {
  const svc = connector()
  const data = await run(svc.PerformUnboundActionWithOrganization, name, [ORG_URL, name, params])
  return (data as Row | null) ?? null
}

/** Finds a property in an action response, wherever the client nested it. */
export function pick(data: unknown, name: string): unknown {
  let cur: unknown = data
  for (let depth = 0; depth < 3 && cur && typeof cur === 'object'; depth++) {
    const obj = cur as Record<string, unknown>
    if (name in obj) return obj[name]
    cur = obj.value ?? obj.data
  }
  return undefined
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
export const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export function chunks<T>(items: T[], size = 25): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export const orFilter = (field: string, ids: string[]): string => `(${ids.map((id) => `${field} eq ${id}`).join(' or ')})`
