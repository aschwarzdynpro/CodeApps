import type { WorkItemInfo } from '../types/solution'
import type { DevOpsService } from './devOpsService'
import { mockDevOpsService } from './mockDevOpsService'
import { powerModeReady } from '../PowerProvider'
import { currentOrgUrl, fetchXmlEscape, fetchXmlQuery, rowStr } from './currentEnvQuery'
import {
  ADO_ACCOUNT,
  ADO_PROJECT_NAME,
  DEVOPS_CONNECTION_REFERENCE,
  devOpsWorkItemUrl,
  isDevOpsAvailable,
  setDevOpsConnectionBound,
} from '../config'
import { AzureDevOpsService } from '../generated/services/AzureDevOpsService'
import type { WorkItemPick } from '../utils/workItem'
import {
  workItemInfoFrom,
  workItemInfoFromRow,
  workItemPickFrom,
} from '../utils/workItem'
import { buildStateOrders, type StateOrders } from '../utils/workItemProgress'

/**
 * Pull work-item ids out of a WIQL result, tolerant of the connector's wrapping:
 * the standard shape is `{ workItems: [{ id }] }`, but some connector responses
 * nest it under `data`.
 */
function extractWiqlIds(data: unknown): string[] {
  const findList = (v: unknown, depth = 0): Array<{ id?: unknown }> => {
    if (!v || typeof v !== 'object' || depth > 3) return []
    const o = v as Record<string, unknown>
    if (Array.isArray(o.workItems)) return o.workItems as Array<{ id?: unknown }>
    if (o.data) return findList(o.data, depth + 1)
    if (o.value) return findList(o.value, depth + 1)
    return []
  }
  return findList(data)
    .map((w) => (w && w.id != null ? String(w.id) : ''))
    .filter(Boolean)
}

/**
 * Real {@link DevOpsService}. Work items are read through the Azure DevOps
 * connector (`AzureDevOpsService.ListWorkItems`) bound to the
 * `pro_CR_SAC_DevOps` connection reference — no cloud flow. Availability is
 * resolved at startup from whether that connection reference is bound in the
 * host environment (read via the Dataverse connector, SP identity) combined
 * with the config flag + configured org/project.
 */
class DataverseDevOpsService implements DevOpsService {
  async refreshAvailability(): Promise<boolean> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDevOpsService.refreshAvailability()
    try {
      const fetchXml =
        `<fetch top="1">` +
        `<entity name="connectionreference">` +
        `<attribute name="connectionid" />` +
        `<filter>` +
        `<condition attribute="connectionreferencelogicalname" operator="eq" value="${fetchXmlEscape(DEVOPS_CONNECTION_REFERENCE)}" />` +
        `</filter>` +
        `</entity></fetch>`
      const rows = await fetchXmlQuery('connectionreferences', fetchXml, currentOrgUrl())
      setDevOpsConnectionBound(rows.length > 0 && rowStr(rows[0].connectionid) !== '')
    } catch (err) {
      console.warn('[devops] connection-reference check failed:', err)
      setDevOpsConnectionBound(false)
    }
    return isDevOpsAvailable()
  }

  async getWorkItem(devOpsId: string): Promise<WorkItemInfo | null> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDevOpsService.getWorkItem(devOpsId)
    // Feature off (not enabled / connection reference unbound / no org+project) —
    // stay dark so a customer without DevOps sees nothing and nothing is called.
    if (!isDevOpsAvailable()) return null
    const id = devOpsId.trim()
    if (!/^\d+$/.test(id)) return null
    try {
      const result = await AzureDevOpsService.ListWorkItems(
        ADO_ACCOUNT,
        ADO_PROJECT_NAME,
        id,
      )
      if (result && result.success === false) {
        console.warn('[devops] ListWorkItems failed:', result)
        return null
      }
      return workItemInfoFrom(
        id,
        result.data?.value?.[0] as unknown as Record<string, unknown> | undefined,
        devOpsWorkItemUrl(id),
      )
    } catch (err) {
      console.warn('[devops] getWorkItem failed:', err)
      return null
    }
  }

  async getWorkItems(devOpsIds: string[]): Promise<WorkItemInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDevOpsService.getWorkItems(devOpsIds)
    if (!isDevOpsAvailable()) return []
    const clean = [
      ...new Set(devOpsIds.map((i) => i.trim()).filter((i) => /^\d+$/.test(i))),
    ]
    if (clean.length === 0) return []
    const out: WorkItemInfo[] = []
    const CHUNK = 100
    for (let i = 0; i < clean.length; i += CHUNK) {
      out.push(...(await this.resolveBatch(clean.slice(i, i + CHUNK))))
    }
    return out
  }

  /**
   * Resolve a batch of ids to work items. Azure DevOps `ListWorkItems` 404s the
   * WHOLE request if ANY id doesn't exist, so on failure we binary-split until
   * the offending id(s) are isolated — valid ids still resolve, nonexistent ones
   * drop out. O(log n) extra calls only when a batch contains a bad id.
   */
  private async resolveBatch(ids: string[]): Promise<WorkItemInfo[]> {
    const infos = await this.listWorkItemsBatch(ids)
    if (infos) return infos
    if (ids.length <= 1) return [] // the single id didn't resolve → skip it
    const mid = Math.floor(ids.length / 2)
    const [a, b] = await Promise.all([
      this.resolveBatch(ids.slice(0, mid)),
      this.resolveBatch(ids.slice(mid)),
    ])
    return [...a, ...b]
  }

  /** ListWorkItems for a batch → WorkItemInfo[], or null when the call failed or
   *  returned nothing (so the caller can split and retry). */
  private async listWorkItemsBatch(
    ids: string[],
  ): Promise<WorkItemInfo[] | null> {
    try {
      const result = await AzureDevOpsService.ListWorkItems(
        ADO_ACCOUNT,
        ADO_PROJECT_NAME,
        ids.join(','),
      )
      if (result && result.success === false) return null
      const rows = (result.data?.value ?? []) as unknown as Array<
        Record<string, unknown>
      >
      if (rows.length === 0) return null
      const out: WorkItemInfo[] = []
      for (const row of rows) {
        const info = workItemInfoFromRow(row)
        if (info) out.push({ ...info, url: devOpsWorkItemUrl(info.id) })
      }
      return out
    } catch {
      return null
    }
  }

  async searchWorkItems(term: string): Promise<WorkItemPick[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDevOpsService.searchWorkItems(term)
    if (!isDevOpsAvailable()) return []
    const q = term.trim()
    if (q.length < 2) return []
    // Numeric terms also match the exact id; single quotes are doubled for WIQL.
    const esc = q.replace(/'/g, "''")
    const idClause = /^\d+$/.test(q) ? `[System.Id] = ${q} OR ` : ''
    const wiql =
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
      `AND (${idClause}[System.Title] CONTAINS '${esc}') ` +
      `ORDER BY [System.ChangedDate] DESC`
    return this.hydrateWiql(wiql, 12)
  }

  async myWorkItems(): Promise<WorkItemPick[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDevOpsService.myWorkItems()
    if (!isDevOpsAvailable()) return []
    const wiql =
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
      `AND [System.AssignedTo] = @Me ` +
      `AND [System.State] NOT IN ('Closed', 'Done', 'Removed') ` +
      `ORDER BY [System.ChangedDate] DESC`
    return this.hydrateWiql(wiql, 50)
  }

  async getAttachment(
    attachmentId: string,
    fileName?: string,
  ): Promise<string | null> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockDevOpsService.getAttachment(attachmentId, fileName)
    if (!isDevOpsAvailable()) return null
    const id = attachmentId.trim()
    if (!id) return null
    try {
      const result = await AzureDevOpsService.GetWorkItemAttachmentAsync(
        ADO_ACCOUNT,
        id,
        ADO_PROJECT_NAME,
        fileName,
      )
      if (result && result.success === false) {
        console.warn('[devops] GetWorkItemAttachment failed:', result)
        return null
      }
      const content = result.data?.content
      if (!content) return null
      // Clamp the MIME to an image/* value so nothing but an image can be built
      // into the data: URI we later drop into the sanitized description HTML.
      const raw = result.data?.contentType ?? ''
      const mime = /^image\/[a-z0-9.+-]+$/i.test(raw) ? raw : 'image/png'
      return `data:${mime};base64,${content}`
    } catch (err) {
      console.warn('[devops] getAttachment failed:', err)
      return null
    }
  }

  async getWorkItemTypeStates(): Promise<StateOrders> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockDevOpsService.getWorkItemTypeStates()
    if (!isDevOpsAvailable()) return new Map()
    try {
      const result = await AzureDevOpsService.ListWorkItemTypes(
        ADO_ACCOUNT,
        ADO_PROJECT_NAME,
      )
      if (result && result.success === false) {
        console.warn('[devops] ListWorkItemTypes failed:', result)
        return new Map()
      }
      return buildStateOrders(
        result.data?.value as Parameters<typeof buildStateOrders>[0],
      )
    } catch (err) {
      console.warn('[devops] getWorkItemTypeStates failed:', err)
      return new Map()
    }
  }

  /**
   * Run a WIQL query and hydrate the resulting work-item id refs into
   * {@link WorkItemPick}s via ListWorkItems (the proven read path). Best-effort:
   * any failure yields []. `limit` caps how many ids are hydrated.
   */
  private async hydrateWiql(wiql: string, limit: number): Promise<WorkItemPick[]> {
    try {
      const wr = await AzureDevOpsService.RunWiqlQuery(ADO_ACCOUNT, ADO_PROJECT_NAME, {
        Query: wiql,
      })
      if (wr && wr.success === false) {
        console.warn('[devops] RunWiqlQuery failed:', wr)
        return []
      }
      const ids = extractWiqlIds(wr.data).slice(0, limit)
      if (ids.length === 0) return []
      const list = await AzureDevOpsService.ListWorkItems(
        ADO_ACCOUNT,
        ADO_PROJECT_NAME,
        ids.join(','),
      )
      if (list && list.success === false) {
        console.warn('[devops] ListWorkItems (wiql) failed:', list)
        return []
      }
      const rows = (list.data?.value ?? []) as unknown as Array<
        Record<string, unknown>
      >
      return rows
        .map((r) => workItemPickFrom(r))
        .filter((p): p is WorkItemPick => p !== null)
    } catch (err) {
      console.warn('[devops] hydrateWiql failed:', err)
      return []
    }
  }
}

export const dataverseDevOpsService: DevOpsService = new DataverseDevOpsService()
