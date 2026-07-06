import type {
  ConnRefRow,
  EnvConfigColumn,
  EnvConfigLoadOptions,
  EnvConfigResult,
  EnvVarCell,
  EnvVarRow,
} from '../types/envConfig'
import { ENV_VAR_TYPE_LABELS, ENV_VAR_TYPE_SECRET } from '../types/envConfig'
import type { EnvConfigService } from './envConfigService'
import { mockEnvConfigService } from './mockEnvConfigService'
import { powerModeReady } from '../PowerProvider'
import { ENVIRONMENTS } from '../config'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

type Row = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : 0

/** Per-environment definition/value/connref snapshot before merging. */
interface EnvVarDef {
  displayName: string
  typeCode: number
  defaultValue: string
}
interface EnvSnapshot {
  defs: Map<string, EnvVarDef> // schemaName → def
  values: Map<string, string> // schemaName → current value
  connRefs: Map<string, { displayName: string; connector: string; bound: boolean }>
  // component-id (lower-case) → name, to translate solution membership.
  defIdToSchema: Map<string, string> // environmentvariabledefinitionid → schema
  valueIdToSchema: Map<string, string> // environmentvariablevalueid → schema
  connIdToLogical: Map<string, string> // connectionreferenceid → logical
}

/** Component-type codes as they appear in `solutioncomponent`. */
const CT_ENV_VAR_DEFINITION = 380
const CT_ENV_VAR_VALUE = 381
const CT_CONNECTION_REFERENCE = 10064

/**
 * Real implementation of {@link EnvConfigService}. Queries every configured
 * environment through the connector's per-organization list op (the same
 * code path Compare / Sharing use) and matches settings by their
 * import-stable name across environments. Runs as the connection (SP), which
 * needs read access to `environmentvariabledefinition`,
 * `environmentvariablevalue` and `connectionreference` in each environment.
 */
class DataverseEnvConfigService implements EnvConfigService {
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
      throw new Error(`${entitySet}${detail ? ` — ${detail}` : ''}`)
    }
    return (result.data as { value?: Row[] } | undefined)?.value ?? []
  }

  private async loadEnv(orgUrl: string): Promise<EnvSnapshot> {
    const defs = new Map<string, EnvVarDef>()
    const defIdToSchema = new Map<string, string>() // definitionId → schemaName
    for (const row of await this.query(
      orgUrl,
      'environmentvariabledefinitions',
      'environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue',
    )) {
      const schema = str(row.schemaname)
      if (!schema) continue
      defs.set(schema, {
        displayName: str(row.displayname) || schema,
        typeCode: num(row.type),
        defaultValue: str(row.defaultvalue),
      })
      defIdToSchema.set(str(row.environmentvariabledefinitionid).toLowerCase(), schema)
    }

    const values = new Map<string, string>()
    const valueIdToSchema = new Map<string, string>()
    for (const row of await this.query(
      orgUrl,
      'environmentvariablevalues',
      'environmentvariablevalueid,value,_environmentvariabledefinitionid_value',
    )) {
      const schema = defIdToSchema.get(
        str(row._environmentvariabledefinitionid_value).toLowerCase(),
      )
      if (!schema) continue
      values.set(schema, str(row.value))
      const vid = str(row.environmentvariablevalueid).toLowerCase()
      if (vid) valueIdToSchema.set(vid, schema)
    }

    const connRefs = new Map<
      string,
      { displayName: string; connector: string; bound: boolean }
    >()
    const connIdToLogical = new Map<string, string>()
    for (const row of await this.query(
      orgUrl,
      'connectionreferences',
      'connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid',
    )) {
      const logical = str(row.connectionreferencelogicalname)
      if (!logical) continue
      const connectorId = str(row.connectorid)
      connRefs.set(logical, {
        displayName: str(row.connectionreferencedisplayname) || logical,
        connector: connectorId.split('/').pop() ?? connectorId,
        bound: !!str(row.connectionid),
      })
      const cid = str(row.connectionreferenceid).toLowerCase()
      if (cid) connIdToLogical.set(cid, logical)
    }

    return { defs, values, connRefs, defIdToSchema, valueIdToSchema, connIdToLogical }
  }

  /**
   * The env-var schema names & connection-reference logical names that are
   * components of `uniqueName` in the host environment. Resolves the solution
   * id, reads its `solutioncomponent` rows and translates the object ids to
   * names via the host snapshot. Throws when the solution can't be found.
   */
  private async solutionMembership(
    hostUrl: string,
    uniqueName: string,
    host: EnvSnapshot,
  ): Promise<{ schemas: Set<string>; logicals: Set<string> }> {
    const sols = await this.query(
      hostUrl,
      'solutions',
      'solutionid',
      `uniquename eq '${uniqueName.replace(/'/g, "''")}'`,
    )
    const solId = str(sols[0]?.solutionid)
    if (!solId)
      throw new Error(
        `solution "${uniqueName}" was not found in the host environment`,
      )
    const comps = await this.query(
      hostUrl,
      'solutioncomponents',
      'objectid,componenttype',
      `_solutionid_value eq ${solId}`,
    )
    const schemas = new Set<string>()
    const logicals = new Set<string>()
    for (const c of comps) {
      const type = num(c.componenttype)
      const oid = str(c.objectid).toLowerCase()
      if (type === CT_ENV_VAR_DEFINITION) {
        const s = host.defIdToSchema.get(oid)
        if (s) schemas.add(s)
      } else if (type === CT_ENV_VAR_VALUE) {
        const s = host.valueIdToSchema.get(oid)
        if (s) schemas.add(s)
      } else if (type === CT_CONNECTION_REFERENCE) {
        const l = host.connIdToLogical.get(oid)
        if (l) logicals.add(l)
      }
    }
    return { schemas, logicals }
  }

  async loadEnvConfig(
    onProgress?: (done: number, total: number, label: string) => void,
    options?: EnvConfigLoadOptions,
  ): Promise<EnvConfigResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockEnvConfigService.loadEnvConfig(onProgress, options)

    const envs = ENVIRONMENTS
    const columns: EnvConfigColumn[] = envs.map((e) => ({
      key: e.key,
      label: e.label,
      isCurrent: !!e.isCurrent,
    }))
    const errors: string[] = []
    const snapshots = new Map<string, EnvSnapshot>()

    let done = 0
    for (const env of envs) {
      onProgress?.(done, envs.length, env.label)
      try {
        snapshots.set(env.key, await this.loadEnv(env.url.replace(/\/+$/, '')))
      } catch (err) {
        errors.push(
          `${env.label}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      onProgress?.(++done, envs.length, env.label)
    }

    // Merge env vars by schema name.
    const schemaNames = new Set<string>()
    for (const snap of snapshots.values())
      for (const s of snap.defs.keys()) schemaNames.add(s)

    const envVars: EnvVarRow[] = [...schemaNames]
      .sort((a, b) => a.localeCompare(b))
      .map((schema) => {
        let displayName = schema
        let typeCode = 0
        for (const env of envs) {
          const def = snapshots.get(env.key)?.defs.get(schema)
          if (def) {
            displayName = def.displayName
            typeCode = def.typeCode
            if (env.isCurrent) break // prefer the host env's metadata
          }
        }
        const isSecret = typeCode === ENV_VAR_TYPE_SECRET
        const cells: Record<string, EnvVarCell> = {}
        for (const env of envs) {
          const snap = snapshots.get(env.key)
          const def = snap?.defs.get(schema)
          if (!snap || !def) {
            cells[env.key] = { present: false, hasValue: false, value: '', usingDefault: false }
            continue
          }
          const current = snap.values.get(schema)
          const hasCurrent = current !== undefined && current !== ''
          const effective = hasCurrent ? (current as string) : def.defaultValue
          const hasValue = hasCurrent || def.defaultValue !== ''
          cells[env.key] = {
            present: true,
            hasValue,
            usingDefault: !hasCurrent && def.defaultValue !== '',
            value: isSecret
              ? hasValue
                ? '•••••• (Key Vault)'
                : '—'
              : effective,
          }
        }
        return { schemaName: schema, displayName, typeLabel: ENV_VAR_TYPE_LABELS[typeCode] ?? 'String', isSecret, cells }
      })

    // Merge connection references by logical name.
    const logicalNames = new Set<string>()
    for (const snap of snapshots.values())
      for (const l of snap.connRefs.keys()) logicalNames.add(l)

    const connRefs: ConnRefRow[] = [...logicalNames]
      .sort((a, b) => a.localeCompare(b))
      .map((logical) => {
        let displayName = logical
        let connectorName = ''
        for (const env of envs) {
          const ref = snapshots.get(env.key)?.connRefs.get(logical)
          if (ref) {
            displayName = ref.displayName
            connectorName = ref.connector
            if (env.isCurrent) break
          }
        }
        const cells: Record<string, { present: boolean; bound: boolean }> = {}
        for (const env of envs) {
          const ref = snapshots.get(env.key)?.connRefs.get(logical)
          cells[env.key] = { present: !!ref, bound: !!ref?.bound }
        }
        return { logicalName: logical, displayName, connectorName, cells }
      })

    // Optional: restrict to a solution's components (resolved in the host).
    if (options?.solutionUniqueName) {
      const host = envs.find((e) => e.isCurrent) ?? envs[0]
      const hostSnap = host ? snapshots.get(host.key) : undefined
      if (!host || !hostSnap) {
        errors.push(
          'Solution filter: the host environment could not be read, so membership is unknown.',
        )
        return { columns, envVars: [], connRefs: [], errors }
      }
      try {
        const { schemas, logicals } = await this.solutionMembership(
          host.url.replace(/\/+$/, ''),
          options.solutionUniqueName,
          hostSnap,
        )
        return {
          columns,
          envVars: envVars.filter((r) => schemas.has(r.schemaName)),
          connRefs: connRefs.filter((r) => logicals.has(r.logicalName)),
          errors,
        }
      } catch (err) {
        errors.push(
          `Solution filter: ${err instanceof Error ? err.message : String(err)}`,
        )
        return { columns, envVars: [], connRefs: [], errors }
      }
    }

    return { columns, envVars, connRefs, errors }
  }
}

export const dataverseEnvConfigService: EnvConfigService =
  new DataverseEnvConfigService()
