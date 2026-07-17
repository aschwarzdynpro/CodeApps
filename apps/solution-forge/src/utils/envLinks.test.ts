import { describe, expect, it } from 'vitest'
import { buildEnvLinkRows, buildGlobalLinks, ENV_LINK_GROUPS } from './envLinks'
import type { EnvironmentDef } from '../types/comparison'

const env = (over: Partial<EnvironmentDef> = {}): EnvironmentDef => ({
  key: 'dev',
  label: 'INT-11 · current',
  url: 'https://operations-d365-schulz-int-11.crm4.dynamics.com',
  environmentId: '431783f6-367c-eb49-984b-4e70e4c0424d',
  isCurrent: true,
  ...over,
})

/** Find one matrix row by its label. */
const row = (envs: EnvironmentDef[], label: string) =>
  buildEnvLinkRows(envs).find((r) => r.label === label)!

describe('buildEnvLinkRows', () => {
  it('groups rows into System / Maker / Admin in that order', () => {
    const groups = [...new Set(buildEnvLinkRows([env()]).map((r) => r.group))]
    expect(groups).toEqual([...ENV_LINK_GROUPS])
  })

  it('returns one url per environment, aligned to the input order', () => {
    const a = env()
    const b = env({
      key: 'uat',
      label: 'UAT',
      url: 'https://uat.crm4.dynamics.com',
      environmentId: 'uat-id',
      isCurrent: false,
    })
    expect(row([a, b], 'OData / Web API v9.2').urls).toEqual([
      'https://operations-d365-schulz-int-11.crm4.dynamics.com/api/data/v9.2/',
      'https://uat.crm4.dynamics.com/api/data/v9.2/',
    ])
  })

  it('derives org-relative links from the environment url', () => {
    const base = 'https://operations-d365-schulz-int-11.crm4.dynamics.com'
    expect(row([env()], 'System (Unified Interface)').urls[0]).toBe(base)
    expect(row([env()], 'Diagnostics').urls[0]).toBe(`${base}/tools/diagnostics/diag.aspx`)
    expect(row([env()], 'Advanced Settings (classic)').urls[0]).toBe(
      `${base}/main.aspx?settingsonly=true`,
    )
  })

  it('trims a trailing slash before appending org paths', () => {
    expect(row([env({ url: 'https://org.crm4.dynamics.com/' })], 'OData / Web API v9.2').urls[0]).toBe(
      'https://org.crm4.dynamics.com/api/data/v9.2/',
    )
  })

  it('builds maker and admin deep links from the environment id (no /environment/ segment)', () => {
    const id = '431783f6-367c-eb49-984b-4e70e4c0424d'
    expect(row([env()], 'Maker — Solutions').urls[0]).toBe(
      `https://make.powerapps.com/environments/${id}/solutions`,
    )
    expect(row([env()], 'Environment Hub').urls[0]).toBe(
      `https://admin.powerplatform.microsoft.com/manage/environments/${id}/hub`,
    )
    expect(row([env()], 'Backup & Restore').urls[0]).toBe(
      `https://admin.powerplatform.microsoft.com/manage/environments/${id}/backupandrestore`,
    )
  })

  it('yields null cells when the url / id are missing', () => {
    const rows = buildEnvLinkRows([env({ url: '', environmentId: '' })])
    expect(rows.find((r) => r.label === 'OData / Web API v9.2')!.urls[0]).toBeNull()
    expect(rows.find((r) => r.label === 'Environment Hub')!.urls[0]).toBeNull()
  })
})

describe('buildGlobalLinks', () => {
  it('returns the admin center plus the governance links', () => {
    expect(buildGlobalLinks().map((l) => l.label)).toEqual([
      'Power Platform Admin Center',
      'Capacity',
      'Release Planner',
      'Service Health (Microsoft 365)',
    ])
  })

  it('every link has an absolute https url', () => {
    for (const l of buildGlobalLinks()) {
      expect(l.url).toMatch(/^https:\/\//)
    }
  })
})
