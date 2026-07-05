import type {
  ConnRefRow,
  EnvConfigColumn,
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
}

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
  ): Promise<Row[]> {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      orgUrl,
      entitySet,
      undefined,
      undefined,
      undefined,
      undefined,
      select,
    )
    if (!result.success) {
      const detail = (result as { error?: { message?: string } }).error?.message
      throw new Error(`${entitySet}${detail ? ` — ${detail}` : ''}`)
    }
    return (result.data as { value?: Row[] } | undefined)?.value ?? []
  }

  private async loadEnv(orgUrl: string): Promise<EnvSnapshot> {
    const defs = new Map<string, EnvVarDef>()
    const byId = new Map<string, string>() // definitionId → schemaName
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
      byId.set(str(row.environmentvariabledefinitionid), schema)
    }

    const values = new Map<string, string>()
    for (const row of await this.query(
      orgUrl,
      'environmentvariablevalues',
      'value,_environmentvariabledefinitionid_value',
    )) {
      const schema = byId.get(str(row._environmentvariabledefinitionid_value))
      if (schema) values.set(schema, str(row.value))
    }

    const connRefs = new Map<
      string,
      { displayName: string; connector: string; bound: boolean }
    >()
    for (const row of await this.query(
      orgUrl,
      'connectionreferences',
      'connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid',
    )) {
      const logical = str(row.connectionreferencelogicalname)
      if (!logical) continue
      const connectorId = str(row.connectorid)
      connRefs.set(logical, {
        displayName: str(row.connectionreferencedisplayname) || logical,
        connector: connectorId.split('/').pop() ?? connectorId,
        bound: !!str(row.connectionid),
      })
    }

    return { defs, values, connRefs }
  }

  async loadEnvConfig(
    onProgress?: (done: number, total: number, label: string) => void,
  ): Promise<EnvConfigResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockEnvConfigService.loadEnvConfig(onProgress)

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

    return { columns, envVars, connRefs, errors }
  }
}

export const dataverseEnvConfigService: EnvConfigService =
  new DataverseEnvConfigService()
