import type { EnvKey } from '../types/comparison'
import type {
  AppSharingResult,
  AppSharingRow,
  AppSharingState,
  CanvasAppKind,
  SharedPrincipal,
} from '../types/sharing'
import type { SharingService } from './sharingService'
import { mockSharingService } from './mockSharingService'
import { powerModeReady } from '../PowerProvider'
import { ENVIRONMENTS } from '../config'
import { SolutioncomponentsService } from '../generated/services/SolutioncomponentsService'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

/**
 * Real implementation of {@link SharingService}.
 *
 * 1. The solution's canvas-app components (solutioncomponent type 300) are
 *    resolved in the current environment, then the `canvasapp` rows give
 *    the import-stable unique name, display name and type.
 * 2. Each environment is asked, per app (matched by name), who the app is
 *    shared with — via the `RetrieveSharedPrincipalsAndAccess` message,
 *    invoked through the connector's `PerformUnboundActionWithOrganization`
 *    so it runs against the chosen environment.
 * 3. Principal ids (users / teams) are resolved to names per environment.
 *
 * Note: solution import never transfers user sharing, so a canvas app can
 * be present in UAT/PROD yet shared with nobody — exactly the gap this
 * surfaces. Custom pages (canvasapptype 2) get access through the
 * model-driven app's security roles rather than direct sharing, so "not
 * shared" is expected for them and not flagged as a problem.
 */

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** componenttype for Canvas App solution components. */
const TYPE_CANVAS_APP = 300

/** canvasapptype → bucket (0 Classic / 3 Unified / 4 Code / 5 Mobile = app). */
const CANVAS_KIND_BY_TYPE: Record<number, CanvasAppKind> = {
  0: 'canvas',
  1: 'componentlibrary',
  2: 'custompage',
  3: 'canvas',
  4: 'canvas',
  5: 'canvas',
}

const FV = '@OData.Community.Display.V1.FormattedValue'

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Turn an AccessRights flag string ("ReadAccess, WriteAccess") into a
 *  compact label ("Read, Write", or "Co-owner" for the full owner set). */
function simplifyAccess(mask: string): string {
  const flags = mask
    .split(',')
    .map((f) => f.trim().replace(/Access$/, ''))
    .filter((f) => f && f !== 'None')
  if (flags.length === 0) return '—'
  const owns = ['Read', 'Write', 'Delete', 'Append', 'AppendTo', 'Share', 'Assign']
  if (owns.every((o) => flags.includes(o))) return 'Co-owner'
  // Read-only is the common "just use it" share.
  if (flags.length === 1 && flags[0] === 'Read') return 'Read'
  return flags.join(', ')
}

export class DataverseSharingService implements SharingService {
  /** Raw connector query against one environment, returns the value rows. */
  private async query(
    orgUrl: string,
    entitySet: string,
    select: string,
    filter?: string,
  ): Promise<Row[]> {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      orgUrl,
      entitySet,
      undefined,
      undefined,
      undefined,
      undefined,
      select,
      filter,
    )
    if (!result.success) {
      const detail = (result as { error?: { message?: string } }).error?.message
      throw new Error(`${entitySet} query failed${detail ? ` — ${detail}` : ''}`)
    }
    return (result.data as { value?: Row[] } | undefined)?.value ?? []
  }

  /** canvasapps in one environment matched by their stable unique names. */
  private async canvasAppsByName(
    orgUrl: string,
    names: string[],
  ): Promise<Map<string, { appId: string; ownerName: string }>> {
    const map = new Map<string, { appId: string; ownerName: string }>()
    for (const chunk of chunks(names, 15)) {
      const filter = chunk
        .map((n) => `name eq '${n.replace(/'/g, "''")}'`)
        .join(' or ')
      const rows = await this.query(
        orgUrl,
        'canvasapps',
        'canvasappid,name,_ownerid_value',
        filter,
      )
      for (const row of rows) {
        const name = str(row.name)
        if (!name) continue
        map.set(name.toLowerCase(), {
          appId: str(row.canvasappid),
          ownerName: str(row[`_ownerid_value${FV}`]) || str(row.owneridname),
        })
      }
    }
    return map
  }

  /**
   * Who one canvas app is shared with in one environment.
   * RetrieveSharedPrincipalsAndAccess is a global message invoked through
   * the connector's unbound-action passthrough; the Target is the canvas
   * app reference. Returns raw principals (names resolved separately).
   */
  private async sharedPrincipals(
    orgUrl: string,
    appId: string,
  ): Promise<{ id: string; type: SharedPrincipal['type']; access: string }[]> {
    const result =
      await MicrosoftDataverseService.PerformUnboundActionWithOrganization(
        orgUrl,
        'RetrieveSharedPrincipalsAndAccess',
        // Target as a typed entity reference — the form the connector's
        // action passthrough expects for a crmbaseentity parameter. If a
        // future connector build wants the @odata.id alias instead, this is
        // the single spot to change.
        { Target: { '@odata.type': 'Microsoft.Dynamics.CRM.canvasapp', canvasappid: appId } },
      )
    if (!result.success) {
      const detail = (result as { error?: { message?: string } }).error?.message
      throw new Error(
        `RetrieveSharedPrincipalsAndAccess failed${detail ? ` — ${detail}` : ''}`,
      )
    }
    const data = (result.data ?? {}) as Record<string, unknown>
    const list = (data.PrincipalAccesses ??
      (data.value as unknown) ??
      []) as Row[]
    const out: { id: string; type: SharedPrincipal['type']; access: string }[] = []
    for (const entry of Array.isArray(list) ? list : []) {
      const principal = (entry.Principal ?? {}) as Row
      const access = simplifyAccess(str(entry.AccessMask))
      const odataType = str(principal['@odata.type']).toLowerCase()
      if (typeof principal.systemuserid === 'string' || odataType.includes('systemuser'))
        out.push({ id: str(principal.systemuserid), type: 'user', access })
      else if (typeof principal.teamid === 'string' || odataType.includes('team'))
        out.push({ id: str(principal.teamid), type: 'team', access })
      else if (typeof principal.organizationid === 'string' || odataType.includes('organization'))
        out.push({ id: str(principal.organizationid), type: 'organization', access })
    }
    return out
  }

  /** Resolve user/team ids to display names in one environment. */
  private async resolveNames(
    orgUrl: string,
    userIds: string[],
    teamIds: string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    const lookup = async (
      entitySet: string,
      idField: string,
      nameField: string,
      ids: string[],
    ) => {
      for (const chunk of chunks([...new Set(ids)], 20)) {
        const filter = chunk.map((id) => `${idField} eq ${id}`).join(' or ')
        try {
          const rows = await this.query(
            orgUrl,
            entitySet,
            `${idField},${nameField}`,
            filter,
          )
          for (const row of rows) {
            const id = str(row[idField])
            if (id) names.set(id.toLowerCase(), str(row[nameField]))
          }
        } catch (err) {
          console.warn(`[sharing] name lookup ${entitySet} failed:`, err)
        }
      }
    }
    await Promise.all([
      userIds.length ? lookup('systemusers', 'systemuserid', 'fullname', userIds) : null,
      teamIds.length ? lookup('teams', 'teamid', 'name', teamIds) : null,
    ])
    return names
  }

  async checkAppSharing(
    solutionId: string,
    onProgress?: (message: string) => void,
  ): Promise<AppSharingResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockSharingService.checkAppSharing(solutionId, onProgress)

    // 1. Canvas-app components of the solution (current env).
    onProgress?.('Resolving canvas apps…')
    const components: Row[] = []
    let skipToken: string | undefined
    do {
      const result = await SolutioncomponentsService.getAll({
        select: ['objectid', 'componenttype'],
        filter: `_solutionid_value eq ${solutionId} and componenttype eq ${TYPE_CANVAS_APP}`,
        ...(skipToken ? { skipToken } : {}),
      })
      if (!result.success || !result.data)
        throw new Error('Could not load the solution components.')
      components.push(...(result.data as unknown as Row[]))
      skipToken = result.skipToken
    } while (skipToken)

    const appObjectIds = [
      ...new Set(components.map((c) => str(c.objectid)).filter(Boolean)),
    ]
    if (appObjectIds.length === 0) return { rows: [], envErrors: {} }

    // 2. canvasapp rows in the current env → stable name, display name, type.
    const devUrl =
      ENVIRONMENTS.find((e) => e.isCurrent)?.url.replace(/\/+$/, '') ??
      ENVIRONMENTS[0].url.replace(/\/+$/, '')
    const baseRows = new Map<string, AppSharingRow>()
    for (const chunk of chunks(appObjectIds, 15)) {
      const filter = chunk.map((id) => `canvasappid eq ${id}`).join(' or ')
      const rows = await this.query(
        devUrl,
        'canvasapps',
        'canvasappid,name,displayname,canvasapptype',
        filter,
      )
      for (const row of rows) {
        const name = str(row.name)
        if (!name) continue
        baseRows.set(name.toLowerCase(), {
          name,
          displayName: str(row.displayname) || name,
          kind: CANVAS_KIND_BY_TYPE[Number(row.canvasapptype ?? 0)] ?? 'canvas',
          byEnv: { dev: null, uat: null, prod: null },
        })
      }
    }
    const rows = [...baseRows.values()]
    const names = rows.map((r) => r.name)

    // 3. Per environment: locate each app by name, fetch its sharing,
    //    resolve principal names.
    const envErrors: Partial<Record<EnvKey, string>> = {}
    const totalSteps = rows.length * ENVIRONMENTS.length
    let done = 0
    for (const env of ENVIRONMENTS) {
      const orgUrl = env.url.replace(/\/+$/, '')
      let located: Map<string, { appId: string; ownerName: string }>
      try {
        located = await this.canvasAppsByName(orgUrl, names)
      } catch (err) {
        console.warn(`[sharing] ${env.key} canvasapp lookup failed:`, err)
        envErrors[env.key] = err instanceof Error ? err.message : String(err)
        for (const row of rows) row.byEnv[env.key] = null
        done += rows.length
        continue
      }

      // Collect sharing for every present app, then resolve names in bulk.
      const states = new Map<string, AppSharingState>()
      const userIds: string[] = []
      const teamIds: string[] = []
      for (const row of rows) {
        const match = located.get(row.name.toLowerCase())
        onProgress?.(`${env.label} · ${row.displayName} (${++done}/${totalSteps})`)
        if (!match) {
          states.set(row.name, { present: false, principals: [] })
          continue
        }
        try {
          const raw = await this.sharedPrincipals(orgUrl, match.appId)
          for (const p of raw) {
            if (p.type === 'user') userIds.push(p.id)
            else if (p.type === 'team') teamIds.push(p.id)
          }
          states.set(row.name, {
            present: true,
            appId: match.appId,
            ownerName: match.ownerName,
            principals: raw.map((p) => ({
              id: p.id,
              type: p.type,
              name: p.id,
              access: p.access,
            })),
          })
        } catch (err) {
          console.warn(`[sharing] ${env.key}/${row.name} sharing failed:`, err)
          states.set(row.name, {
            present: true,
            appId: match.appId,
            ownerName: match.ownerName,
            principals: [],
            error: true,
          })
        }
      }

      const nameMap = await this.resolveNames(orgUrl, userIds, teamIds)
      for (const row of rows) {
        const state = states.get(row.name) ?? null
        if (state) {
          for (const p of state.principals)
            p.name = nameMap.get(p.id.toLowerCase()) || p.id
        }
        row.byEnv[env.key] = state
      }
    }

    return { rows, envErrors }
  }
}

export const dataverseSharingService = new DataverseSharingService()
