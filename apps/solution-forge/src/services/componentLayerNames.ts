import { ENVIRONMENTS } from '../config'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

/**
 * componenttype → `msdyn_solutioncomponentname`, the value the
 * `msdyn_componentlayer` virtual table expects. Used by both the Layer
 * Inspector (full layer stack) and Compare (existence across environments).
 *
 * The classic metadata types are NOT listed in `solutioncomponentdefinition`
 * (only solution-aware tables are), so this static map covers them — values
 * follow the platform SchemaName convention; 'Entity', 'Workflow' and
 * 'PluginAssembly' are wire-verified. Newer types (canvas apps, connection
 * references, environment variables, custom APIs, …) are merged in
 * dynamically from `solutioncomponentdefinition`.
 */
const LAYER_COMPONENT_NAMES: Record<number, string> = {
  1: 'Entity',
  2: 'Attribute',
  3: 'Relationship',
  9: 'OptionSet',
  10: 'EntityRelationship',
  14: 'EntityKey',
  20: 'Role',
  26: 'SavedQuery',
  29: 'Workflow',
  31: 'Report',
  50: 'RibbonCustomization',
  59: 'SavedQueryVisualization',
  60: 'SystemForm',
  61: 'WebResource',
  62: 'SiteMap',
  66: 'CustomControl',
  70: 'FieldSecurityProfile',
  80: 'AppModule',
  91: 'PluginAssembly',
  92: 'SdkMessageProcessingStep',
  95: 'ServiceEndpoint',
  150: 'RoutingRule',
}

/**
 * Component types the Layer Inspector skips outright: their unmanaged
 * "Active" layer is by design, not drift, so inspecting them only yields
 * false positives. Environment variable definition (380) / value (381) keep
 * their current value in the unmanaged layer; connection references (10064)
 * bind unmanaged the same way. (Values verified from solutioncomponentdefinition.)
 */
export const LAYER_IGNORED_TYPES = new Set<number>([380, 381, 10064])

let cache: Promise<Map<number, string>> | null = null

/**
 * Resolve the componenttype → solutioncomponentname map once per session
 * (static classic map plus the solution-aware types from
 * `solutioncomponentdefinition`). The dynamic lookup runs against the
 * current environment via the connector.
 */
export function layerComponentNames(): Promise<Map<number, string>> {
  cache ??= (async () => {
    const map = new Map<number, string>(
      Object.entries(LAYER_COMPONENT_NAMES).map(([type, name]) => [
        Number(type),
        name,
      ]),
    )
    try {
      const url =
        ENVIRONMENTS.find((e) => e.isCurrent)?.url.replace(/\/+$/, '') ??
        ENVIRONMENTS[0].url.replace(/\/+$/, '')
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        url,
        'solutioncomponentdefinitions',
        undefined,
        undefined,
        undefined,
        undefined,
        'solutioncomponenttype,name',
      )
      const rows =
        (result.data as { value?: Record<string, unknown>[] } | undefined)
          ?.value ?? []
      for (const row of rows) {
        const type = Number(row.solutioncomponenttype ?? 0)
        const name = typeof row.name === 'string' ? row.name : ''
        if (type && name && !map.has(type)) map.set(type, name)
      }
    } catch (err) {
      // The static map still covers the classic types — keep going.
      console.warn('[layers] solutioncomponentdefinition lookup failed:', err)
    }
    return map
  })()
  return cache
}
