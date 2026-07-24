import { describe, expect, it } from 'vitest'
import {
  buildEnvironmentConfigRecords,
  buildWorkbenchSettingsCore,
  buildWorkbenchSettingsOptional,
  emptySettings,
  guessEnvKey,
  isHttpUrl,
  normalizeUrl,
  suggestEnvRows,
  validateProvisioning,
} from './provisioning'
import type { ProvisioningInput, WizardEnvRow } from '../types/provisioning'

describe('normalizeUrl / isHttpUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeUrl('  https://org.crm4.dynamics.com/// ')).toBe(
      'https://org.crm4.dynamics.com',
    )
  })
  it('validates absolute http(s) URLs', () => {
    expect(isHttpUrl('https://org.crm4.dynamics.com')).toBe(true)
    expect(isHttpUrl('org.crm4.dynamics.com')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })
})

describe('guessEnvKey', () => {
  it('classifies by host segments, uat/prod before dev', () => {
    expect(guessEnvKey('https://operations-d365-schulz-uat-1-1.crm4.dynamics.com')).toBe('uat')
    expect(guessEnvKey('https://operations-d365-schulz-prod.crm4.dynamics.com')).toBe('prod')
    expect(guessEnvKey('https://operations-d365-schulz-int-11.crm4.dynamics.com')).toBe('dev')
    expect(guessEnvKey('https://contoso.crm.dynamics.com')).toBeNull()
  })
})

describe('suggestEnvRows', () => {
  const orgs = [
    { url: 'https://schulz-int-11.crm4.dynamics.com', name: 'INT 11' },
    { url: 'https://schulz-uat-1-1.crm4.dynamics.com/', name: 'UAT' },
    { url: 'https://schulz-prod.crm4.dynamics.com', name: 'PROD' },
  ]

  it('marks the host org as the current dev row with its env id', () => {
    const rows = suggestEnvRows(orgs, 'https://schulz-int-11.crm4.dynamics.com/', 'env-guid')
    const dev = rows.find((r) => r.key === 'dev')!
    expect(dev.isCurrent).toBe(true)
    expect(dev.environmentId).toBe('env-guid')
    expect(dev.url).toBe('https://schulz-int-11.crm4.dynamics.com')
  })

  it('slots the remaining orgs into uat/prod without an env id', () => {
    const rows = suggestEnvRows(orgs, 'https://schulz-int-11.crm4.dynamics.com', 'env-guid')
    expect(rows.map((r) => r.key).sort()).toEqual(['dev', 'prod', 'uat'])
    const uat = rows.find((r) => r.key === 'uat')!
    expect(uat.isCurrent).toBe(false)
    expect(uat.environmentId).toBe('')
  })

  it('produces exactly one row per key', () => {
    const dupes = [
      ...orgs,
      { url: 'https://schulz-uat-2-2.crm4.dynamics.com', name: 'UAT 2' },
    ]
    const rows = suggestEnvRows(dupes, 'https://schulz-int-11.crm4.dynamics.com', 'x')
    const keys = rows.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('prefers a dev/int-looking org as host when the host URL is unknown', () => {
    const shuffled = [orgs[2], orgs[1], orgs[0]] // prod, uat, int
    const rows = suggestEnvRows(shuffled, '', '')
    const current = rows.find((r) => r.isCurrent)!
    expect(current.key).toBe('dev')
    expect(current.url).toBe('https://schulz-int-11.crm4.dynamics.com')
  })

  it('falls back to the first org as host when nothing looks like dev', () => {
    const noDev = [
      { url: 'https://a-uat.crm4.dynamics.com', name: 'A' },
      { url: 'https://b-prod.crm4.dynamics.com', name: 'B' },
    ]
    const rows = suggestEnvRows(noDev, '', 'env-x')
    expect(rows[0].isCurrent).toBe(true)
    expect(rows[0].environmentId).toBe('env-x')
  })
})

describe('validateProvisioning', () => {
  const base = (over: Partial<WizardEnvRow> = {}): WizardEnvRow => ({
    key: 'dev',
    label: 'DEV',
    url: 'https://schulz-int-11.crm4.dynamics.com',
    environmentId: '',
    isCurrent: true,
    order: 0,
    ...over,
  })
  const input = (
    envs: WizardEnvRow[],
    settingsOver: Partial<ProvisioningInput['settings']> = {},
  ): ProvisioningInput => ({
    environments: envs,
    settings: {
      ...emptySettings(),
      publisher: 'dynamicspro',
      publisherId: 'pub-guid',
      deploymentManagerRole: 'INT | Deployment Manager',
      ...settingsOver,
    },
  })

  it('passes a well-formed setup', () => {
    const res = validateProvisioning(input([base()]))
    expect(res.ok).toBe(true)
  })

  it('requires a publisher and a role', () => {
    const res = validateProvisioning(
      input([base()], { publisherId: '', deploymentManagerRole: '  ' }),
    )
    expect(res.publisher.length).toBeGreaterThan(0)
    expect(res.role.length).toBeGreaterThan(0)
    expect(res.ok).toBe(false)
  })

  it('rejects an empty environment set', () => {
    const res = validateProvisioning(input([]))
    expect(res.environments.length).toBeGreaterThan(0)
  })

  it('requires exactly one current environment', () => {
    const two = validateProvisioning(
      input([base(), base({ key: 'uat', url: 'https://u.crm4.dynamics.com' })]),
    )
    expect(two.environments.some((e) => /one environment/i.test(e))).toBe(true)
    const none = validateProvisioning(input([base({ isCurrent: false })]))
    expect(none.environments.some((e) => /current/i.test(e))).toBe(true)
  })

  it('flags an invalid URL, duplicate keys and duplicate URLs', () => {
    const badUrl = validateProvisioning(input([base({ url: 'not-a-url' })]))
    expect(badUrl.environments.some((e) => /valid URL/i.test(e))).toBe(true)

    const dupKey = validateProvisioning(
      input([
        base(),
        base({ isCurrent: false, url: 'https://b.crm4.dynamics.com' }),
      ]),
    )
    expect(dupKey.environments.some((e) => /used more than once/i.test(e))).toBe(true)

    const dupUrl = validateProvisioning(
      input([base(), base({ key: 'uat', isCurrent: false })]),
    )
    expect(dupUrl.environments.some((e) => /point at/i.test(e))).toBe(true)
  })
})

describe('record builders', () => {
  it('omits empty optional fields from the workbench-settings core payload', () => {
    const rec = buildWorkbenchSettingsCore({
      ...emptySettings(),
      publisher: 'dynamicspro',
      publisherId: 'pub-guid',
      deploymentManagerRole: 'INT | Deployment Manager',
    })
    expect(rec).toEqual({
      pro_name: 'Workbench Settings',
      pro_publisher_str: 'dynamicspro',
      pro_publisherid: 'pub-guid',
      pro_deploymentmanagerrole: 'INT | Deployment Manager',
    })
    expect('pro_adoorgurl' in rec).toBe(false)
  })

  it('collects only set flow-definition columns into the optional payload', () => {
    const empty = buildWorkbenchSettingsOptional(emptySettings())
    expect(empty).toEqual({})
    const filled = buildWorkbenchSettingsOptional({
      ...emptySettings(),
      flowDefinition: {
        table: 'hso_cloudflow',
        statusCol: 'hso_flowstate',
        nameCol: 'hso_name',
        uniqueCol: '',
        areaCol: '',
      },
    })
    expect(filled).toEqual({
      pro_flowdefinitiontable: 'hso_cloudflow',
      pro_flowdefinitionstatus: 'hso_flowstate',
      pro_flowdefinitionname: 'hso_name',
    })
  })

  it('builds one environment-config record per row, normalising the URL', () => {
    const recs = buildEnvironmentConfigRecords([
      {
        key: 'dev',
        label: 'DEV',
        url: 'https://d.crm4.dynamics.com/',
        environmentId: 'env-1',
        isCurrent: true,
        order: 0,
      },
      {
        key: 'uat',
        label: 'UAT',
        url: 'https://u.crm4.dynamics.com',
        environmentId: '',
        isCurrent: false,
        order: 1,
      },
    ])
    expect(recs[0]).toEqual({
      pro_name: 'DEV',
      pro_key: 'dev',
      pro_url: 'https://d.crm4.dynamics.com',
      pro_iscurrent: true,
      pro_order_int: 0,
      pro_environmentid: 'env-1',
    })
    // No env id set → the column is omitted, not written empty.
    expect('pro_environmentid' in recs[1]).toBe(false)
  })
})
