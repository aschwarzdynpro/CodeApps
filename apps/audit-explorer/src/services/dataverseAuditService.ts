import type {
  AttributeChange,
  AuditEvent,
  AuditOperation,
} from '../types/audit'
import { mockAuditService } from './mockAuditService'

/**
 * Real implementation of {@link AuditService} backed by the Dataverse `audit`
 * table. It auto-falls back to the mock service whenever the generated data
 * source isn't present, so the app keeps running during local development.
 *
 * ── Enabling real data ────────────────────────────────────────────────────
 * 1. Connect + register the app:
 *      pac auth create --environment <ENV-ID>
 *      power-apps init --display-name "Audit Explorer" --environment-id <ENV-ID>
 * 2. Add the audit table as a data source (generates src/generated/services):
 *      pac code add-data-source -a dataverse -t audit
 * 3. For the field-level diff, add the RetrieveAuditDetails function:
 *      power-apps find-dataverse-api   (then add-dataverse-api for the match)
 * 4. Swap the dynamic import in `loadAuditTable()` below for the static,
 *    type-safe import the CLI generates (see the comment there).
 *
 * Until step 4, the dynamic import resolves at runtime only; if it fails the
 * adapter transparently uses the mock data.
 */

/** Dataverse `operation` option-set values → friendly operation names. */
const OPERATION_BY_CODE: Record<number, AuditOperation> = {
  1: 'Create',
  2: 'Update',
  3: 'Delete',
  4: 'Access',
}

/** OData annotation suffix Dataverse uses for option-set / lookup labels. */
const FV = '@OData.Community.Display.V1.FormattedValue'

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')
  return letters.toUpperCase() || '??'
}

/**
 * Map a raw `audit` row to our {@link AuditEvent}. Field-level `changes` are
 * loaded lazily via {@link DataverseAuditService.getChanges}, so they start
 * empty here. Property access is defensive (bracket notation + formatted-value
 * annotations) so it works regardless of the exact generated model shape —
 * tighten the types once you import the generated `Audit` model.
 */
function toAuditEvent(row: Record<string, unknown>): AuditEvent {
  const opCode = Number(row['operation'] ?? 0)
  const tableLogical = String(row['objecttypecode'] ?? '')
  const userName = String(row[`_userid_value${FV}`] ?? row['useridname'] ?? 'Unknown')
  return {
    id: String(row['auditid'] ?? ''),
    createdOn: String(row['createdon'] ?? ''),
    operation: OPERATION_BY_CODE[opCode] ?? 'Update',
    tableName: String(row[`objecttypecode${FV}`] ?? tableLogical),
    tableLogicalName: tableLogical,
    recordId: String(row['_objectid_value'] ?? ''),
    recordName: String(row[`_objectid_value${FV}`] ?? row['objectidname'] ?? ''),
    user: { name: userName, initials: initialsFrom(userName) },
    changes: [],
  }
}

interface GeneratedAuditTable {
  getAll: (options?: {
    select?: string[]
    orderBy?: string[]
    top?: number
    filter?: string
  }) => Promise<{ data?: Record<string, unknown>[] }>
}

export class DataverseAuditService {
  private auditTablePromise?: Promise<GeneratedAuditTable | null>

  /**
   * Lazily resolve the generated `AuditService`. The dynamic specifier keeps
   * the build green while `src/generated/services` doesn't exist yet.
   *
   * After running `pac code add-data-source -a dataverse -t audit`, replace
   * the body with the generated static import for full type safety:
   *
   *   import { AuditService } from '../generated/services/AuditService'
   *   return AuditService
   */
  private loadAuditTable(): Promise<GeneratedAuditTable | null> {
    if (!this.auditTablePromise) {
      const specifier = '../generated/services/' + 'AuditService'
      this.auditTablePromise = import(/* @vite-ignore */ specifier)
        .then((m) => (m.AuditService ?? null) as GeneratedAuditTable | null)
        .catch(() => null)
    }
    return this.auditTablePromise
  }

  async list(): Promise<AuditEvent[]> {
    const table = await this.loadAuditTable()
    if (!table) return mockAuditService.list()
    try {
      const result = await table.getAll({
        select: [
          'auditid',
          'createdon',
          'operation',
          'objecttypecode',
          '_objectid_value',
          '_userid_value',
        ],
        orderBy: ['createdon desc'],
        top: 500,
      })
      return (result.data ?? []).map(toAuditEvent)
    } catch {
      return mockAuditService.list()
    }
  }

  /**
   * Resolve the attribute-level old/new values for one audit record.
   *
   * Wire this to the Dataverse `RetrieveAuditDetails` function (added via
   * `power-apps find-dataverse-api`). Its response contains an
   * `AttributeAuditDetail` with `OldValue` / `NewValue` entities keyed by
   * attribute logical name; map those into {@link AttributeChange}. Until the
   * function is wired up, the mock changes are returned as a stand-in.
   */
  async getChanges(auditId: string): Promise<AttributeChange[]> {
    // TODO: replace with a real RetrieveAuditDetails call, e.g.
    //   const detail = await AuditDetailsService.retrieveAuditDetails(auditId)
    //   return mapAuditDetail(detail)
    return mockAuditService.getChanges(auditId)
  }
}

export const dataverseAuditService = new DataverseAuditService()
