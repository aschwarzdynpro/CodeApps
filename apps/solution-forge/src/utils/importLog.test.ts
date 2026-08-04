// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  componentTypeLabel,
  importJobStatusHeuristic,
  parseImportLog,
} from './importLog'

/** Trimmed-down but structurally faithful importjob.data sample. */
const FAILED_WITH_DEPENDENCIES = `<?xml version="1.0" encoding="utf-16"?>
<importexportxml start="0" stop="1" progress="35">
  <solutionManifests>
    <solutionManifest languagecode="1033" id="deploy_q3" LocalizedName="Deployment Q3" processed="true">
      <UniqueName>deploy_q3</UniqueName>
      <Version>1.2.0.0</Version>
      <result result="failure" errorcode="0x80048033" errortext="The import of solution: deploy_q3 failed." datetimeticks="0" />
      <results />
      <MissingDependencies>
        <MissingDependency>
          <Required key="1" type="61" schemaName="hso_/scripts/account.js" displayName="account.js" solution="CoreScripts (1.0.0.3)" />
          <Dependent key="2" type="60" schemaName="account_main" displayName="Account Main Form" parentSchemaName="account" parentDisplayName="Account" id="{aaaa0000-0000-0000-0000-000000000001}" />
        </MissingDependency>
        <MissingDependency>
          <Required key="3" type="2" schemaName="hso_creditscore" displayName="Credit Score" solution="Active" parentSchemaName="account" parentDisplayName="Account" />
          <Dependent key="4" type="26" schemaName="hso_hotaccounts" displayName="Hot Accounts" parentSchemaName="account" />
        </MissingDependency>
      </MissingDependencies>
    </solutionManifest>
  </solutionManifests>
  <entities>
    <entity>
      <result result="failure" errorcode="0x80048033" errortext="The dependent component Form (Id=aaaa0000-0000-0000-0000-000000000001) does not exist." />
    </entity>
    <entity>
      <result result="failure" errorcode="0x80048033" errortext="The dependent component Form (Id=aaaa0000-0000-0000-0000-000000000001) does not exist." />
    </entity>
    <entity name="contact">
      <result result="warning" errorcode="0x8004F039" errortext="The web resource is customizable but the publisher differs." />
    </entity>
  </entities>
</importexportxml>`

const SUCCEEDED = `<?xml version="1.0"?>
<importexportxml>
  <solutionManifests>
    <solutionManifest>
      <UniqueName>feature_4711</UniqueName>
      <Version>1.0.0.2</Version>
      <result result="success" errorcode="0" errortext="" />
    </solutionManifest>
  </solutionManifests>
</importexportxml>`

/**
 * Real-world shape: the platform embeds the whole `<MissingDependencies>` block
 * — as escaped XML — inside the manifest's `errortext`, uses a string `type`
 * ("connectionreference") and an `id.<…>name` attribute instead of `schemaName`.
 */
const EMBEDDED_MISSING_DEPS = (() => {
  const msg =
    'Solution manifest import: FAILURE: The following solution cannot be ' +
    'imported: SSTCoreV2. Some dependencies are missing. The missing ' +
    'dependencies are : <MissingDependencies canResolveAllMissingDependencies="False">' +
    '<MissingDependency canResolveMissingDependency="False">' +
    '<Required type="connectionreference" displayName="ssid_CRDataverseInternal" ' +
    'solution="Workbench (1.0.0.2)" id.connectionreferencelogicalname="ssid_CRDataverseInternal" />' +
    '<Dependent type="29" displayName="PA | Quote | Print Quote" ' +
    'id="{2438389e-78d7-ef11-a72f-000d3adbc595}" /></MissingDependency>' +
    '</MissingDependencies> , ProductUpdatesOnly : False'
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  return (
    `<importexportxml><solutionManifests><solutionManifest>` +
    `<UniqueName>SSTCoreV2</UniqueName><Version>2026.0623.4</Version>` +
    `<result result="failure" errorcode="0x80048033" errortext="${esc(msg)}" />` +
    `</solutionManifest></solutionManifests></importexportxml>`
  )
})()

describe('parseImportLog', () => {
  it('extracts manifest info and the failure verdict', () => {
    const d = parseImportLog(FAILED_WITH_DEPENDENCIES)
    expect(d.solutionUniqueName).toBe('deploy_q3')
    expect(d.solutionVersion).toBe('1.2.0.0')
    expect(d.status).toBe('failed')
    expect(d.topErrorText).toContain('failed')
  })

  it('extracts every MissingDependency with Required/Dependent detail', () => {
    const d = parseImportLog(FAILED_WITH_DEPENDENCIES)
    expect(d.missingDependencies).toHaveLength(2)
    const [dep1, dep2] = d.missingDependencies
    expect(dep1).toMatchObject({
      requiredTypeCode: 61,
      requiredTypeLabel: 'Web Resource',
      requiredSchemaName: 'hso_/scripts/account.js',
      requiredDisplayName: 'account.js',
      requiredSolution: 'CoreScripts (1.0.0.3)',
      dependentTypeCode: 60,
      dependentTypeLabel: 'Form',
      dependentDisplayName: 'Account Main Form',
      dependentParent: 'Account',
    })
    // Parent falls back to the schema name when no display name is present.
    expect(dep2.dependentParent).toBe('account')
    expect(dep2.requiredTypeLabel).toBe('Column')
  })

  it('reports the parent of the MISSING component too', () => {
    const d = parseImportLog(FAILED_WITH_DEPENDENCIES)
    const [dep1, dep2] = d.missingDependencies
    // "Column: Credit Score" is unactionable without knowing its table.
    expect(dep2.requiredParent).toBe('Account')
    // Absent on the required node → empty, not the dependent's parent.
    expect(dep1.requiredParent).toBe('')
  })

  it('falls back to the parent schema name for the missing component', () => {
    const xml = `<importexportxml><solutionManifest>
      <UniqueName>X</UniqueName><MissingDependencies><MissingDependency>
        <Required key="1" type="26" schemaName="hso_offeneprojekte" displayName="Offene Projekte" solution="Active" parentSchemaName="hso_projekt" />
        <Dependent key="2" type="60" schemaName="f" displayName="Informationen" />
      </MissingDependency></MissingDependencies>
    </solutionManifest></importexportxml>`
    expect(parseImportLog(xml).missingDependencies[0].requiredParent).toBe(
      'hso_projekt',
    )
  })

  it('collects generic failures deduped, failures before warnings', () => {
    const d = parseImportLog(FAILED_WITH_DEPENDENCIES)
    // Two identical failure nodes collapse into one + one warning.
    expect(d.failures).toHaveLength(2)
    expect(d.failures[0].severity).toBe('failure')
    expect(d.failures[0].errorText).toContain('does not exist')
    expect(d.failures[1].severity).toBe('warning')
  })

  it('parses missing dependencies embedded (escaped) in the manifest error', () => {
    const d = parseImportLog(EMBEDDED_MISSING_DEPS)
    expect(d.status).toBe('failed')
    expect(d.solutionUniqueName).toBe('SSTCoreV2')
    expect(d.missingDependencies).toHaveLength(1)
    expect(d.missingDependencies[0]).toMatchObject({
      requiredTypeCode: 10064,
      requiredTypeLabel: 'Connection Reference',
      requiredSchemaName: 'ssid_CRDataverseInternal',
      requiredDisplayName: 'ssid_CRDataverseInternal',
      requiredSolution: 'Workbench (1.0.0.2)',
      dependentTypeCode: 29,
      dependentTypeLabel: 'Process',
      dependentDisplayName: 'PA | Quote | Print Quote',
    })
    // The raw XML is lifted out of the headline; a readable lead-in remains,
    // and nothing leaks into the generic-failures table.
    expect(d.topErrorText).not.toContain('<MissingDependencies')
    expect(d.topErrorText).toContain('SSTCoreV2')
    expect(d.failures).toHaveLength(0)
  })

  it('reports success from the manifest verdict', () => {
    const d = parseImportLog(SUCCEEDED)
    expect(d.status).toBe('succeeded')
    expect(d.missingDependencies).toHaveLength(0)
    expect(d.failures).toHaveLength(0)
  })

  it('never throws on garbage input', () => {
    expect(parseImportLog('').status).toBe('unknown')
    expect(parseImportLog('<not-closed').status).toBe('unknown')
  })
})

describe('helpers', () => {
  it('labels known component types and falls back to the code', () => {
    expect(componentTypeLabel(61)).toBe('Web Resource')
    expect(componentTypeLabel(9999)).toBe('Type 9999')
    expect(componentTypeLabel(null)).toBe('')
  })

  it('derives the list status heuristically', () => {
    expect(importJobStatusHeuristic(100, '2026-01-01', '2026-01-01')).toBe('succeeded')
    expect(importJobStatusHeuristic(40, '2026-01-01', '2026-01-01')).toBe('failed')
    expect(importJobStatusHeuristic(40, '', '2026-01-01')).toBe('running')
    expect(importJobStatusHeuristic(0, '', '')).toBe('unknown')
  })
})
