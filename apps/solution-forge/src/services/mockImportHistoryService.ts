import type {
  ImportJobQuery,
  ImportJobSummary,
  ImportLogDetail,
} from '../types/importHistory'
import type { ImportHistoryService } from './importHistoryService'
import { parseImportLog } from '../utils/importLog'

/**
 * Mock implementation of {@link ImportHistoryService} — a seeded import
 * history with a clean import, a dependency failure (parsed from a
 * structurally faithful sample log) and a running job, so the viewer incl.
 * the missing-dependency table is demoable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

const JOBS: ImportJobSummary[] = [
  {
    id: 'job-0005',
    solutionName: 'SSTCoreV2',
    startedOn: hoursAgo(1),
    completedOn: hoursAgo(0.98),
    progress: 37,
    status: 'failed',
    createdBy: 'Andy Schwarz',
    context: 'Upgrade · ImportUpgrade',
  },
  {
    id: 'job-0004',
    solutionName: 'deploy_q3',
    startedOn: hoursAgo(2),
    completedOn: '',
    progress: 46,
    status: 'running',
    createdBy: 'Andy Schwarz',
    context: 'Upgrade',
  },
  {
    id: 'job-0003',
    solutionName: 'deploy_q3',
    startedOn: hoursAgo(26),
    completedOn: hoursAgo(25.8),
    progress: 35,
    status: 'failed',
    createdBy: 'Andy Schwarz',
    context: 'New',
  },
  {
    id: 'job-0002',
    solutionName: 'feature_4711',
    startedOn: hoursAgo(50),
    completedOn: hoursAgo(49.9),
    progress: 100,
    status: 'succeeded',
    createdBy: 'Marie Curie',
    context: 'Update',
  },
  {
    id: 'job-0001',
    solutionName: 'CoreScripts',
    startedOn: hoursAgo(120),
    completedOn: hoursAgo(119.8),
    progress: 100,
    status: 'succeeded',
    createdBy: 'Niels Bohr',
    context: 'New',
  },
]

const FAILED_LOG = `<?xml version="1.0" encoding="utf-16"?>
<importexportxml>
  <solutionManifests>
    <solutionManifest>
      <UniqueName>deploy_q3</UniqueName>
      <Version>1.2.0.0</Version>
      <result result="failure" errorcode="0x80048033" errortext="The import of solution: deploy_q3 failed. Required components are missing in the target environment." />
      <MissingDependencies>
        <MissingDependency>
          <Required type="61" schemaName="hso_/scripts/account.js" displayName="account.js" solution="CoreScripts (1.0.0.3)" />
          <Dependent type="60" schemaName="account_main" displayName="Account Main Form" parentSchemaName="account" parentDisplayName="Account" />
        </MissingDependency>
        <MissingDependency>
          <Required type="2" schemaName="hso_creditscore" displayName="Credit Score" solution="Active" />
          <Dependent type="26" schemaName="hso_hotaccounts" displayName="Hot Accounts" parentSchemaName="account" parentDisplayName="Account" />
        </MissingDependency>
        <MissingDependency>
          <Required type="10064" schemaName="hso_sharedsftp" displayName="SFTP - SSH" solution="IntegrationBase (2.1.0.0)" />
          <Dependent type="29" schemaName="hso_invoiceexport" displayName="PA | SCHED | Invoice Export" />
        </MissingDependency>
      </MissingDependencies>
    </solutionManifest>
  </solutionManifests>
  <entities>
    <entity name="account">
      <result result="warning" errorcode="0x8004F039" errortext="The publisher of an existing web resource differs from the imported one." />
    </entity>
  </entities>
</importexportxml>`

const SUCCESS_LOG = (name: string, version: string) =>
  `<?xml version="1.0"?><importexportxml><solutionManifests><solutionManifest>` +
  `<UniqueName>${name}</UniqueName><Version>${version}</Version>` +
  `<result result="success" errorcode="0" errortext="" />` +
  `</solutionManifest></solutionManifests></importexportxml>`

/**
 * Real-world variant: the platform embeds the `<MissingDependencies>` block —
 * as escaped XML — inside the manifest's `errortext`, with a string `type`
 * ("connectionreference") and an `id.<…>name` attribute instead of `schemaName`.
 * Kept faithful so the parser fix is demoable offline.
 */
const EMBEDDED_DEP_LOG = (() => {
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

const LOGS: Record<string, string> = {
  'job-0005': EMBEDDED_DEP_LOG,
  'job-0003': FAILED_LOG,
  'job-0002': SUCCESS_LOG('feature_4711', '1.0.0.2'),
  'job-0001': SUCCESS_LOG('CoreScripts', '1.0.0.3'),
}

/**
 * Per-environment extras so the Release Timeline is demoable offline: the
 * mock release `deploy_sprint_12` was imported into UAT (ok) and failed in
 * PROD.
 */
const ENV_JOBS: Record<string, ImportJobSummary[]> = {
  uat: [
    {
      id: 'job-uat-01',
      solutionName: 'deploy_sprint_12',
      startedOn: hoursAgo(45),
      completedOn: hoursAgo(44.8),
      progress: 100,
      status: 'succeeded',
      createdBy: 'Andy Schwarz',
      context: 'Update',
    },
  ],
  prod: [
    {
      id: 'job-prod-01',
      solutionName: 'deploy_sprint_12',
      startedOn: hoursAgo(20),
      completedOn: hoursAgo(19.9),
      progress: 41,
      status: 'failed',
      createdBy: 'Andy Schwarz',
      context: 'Update',
    },
  ],
}

class MockImportHistoryService implements ImportHistoryService {
  async listImportJobs(
    envKey: string,
    query?: ImportJobQuery,
  ): Promise<ImportJobSummary[]> {
    await delay(250)
    const extra = ENV_JOBS[envKey] ?? []
    // The host env carries the rich base list; others just their extras.
    let base = (extra.length > 0 ? extra : JOBS).map((j) => ({ ...j }))
    if (query?.solutionName) {
      const needle = query.solutionName.toLowerCase()
      base = base.filter((j) =>
        query.solutionMatch === 'like'
          ? j.solutionName.toLowerCase().includes(needle)
          : j.solutionName.toLowerCase() === needle,
      )
    }
    if (query?.status) base = base.filter((j) => j.status === query.status)
    return base
  }

  async getImportLog(jobId: string, _envKey: string): Promise<ImportLogDetail> {
    void _envKey
    await delay(250)
    const xml = LOGS[jobId]
    if (!xml)
      return {
        solutionUniqueName: '',
        solutionVersion: '',
        status: 'running',
        topErrorText: 'The import is still running — no log payload yet.',
        missingDependencies: [],
        failures: [],
      }
    return parseImportLog(xml)
  }
}

export const mockImportHistoryService: ImportHistoryService =
  new MockImportHistoryService()
