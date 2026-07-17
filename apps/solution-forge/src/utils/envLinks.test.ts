import { describe, expect, it } from 'vitest'
import { buildEnvLinkGroups, buildGlobalLinks } from './envLinks'
import type { EnvironmentDef } from '../types/comparison'

const env = (over: Partial<EnvironmentDef> = {}): EnvironmentDef => ({
  key: 'dev',
  label: 'INT-11 · current',
  url: 'https://operations-d365-schulz-int-11.crm4.dynamics.com',
  environmentId: '431783f6-367c-eb49-984b-4e70e4c0424d',
  isCurrent: true,
  ...over,
})

/** Flatten all links of an environment for easy lookup by label. */
const linksOf = (e: EnvironmentDef): Record<string, string> =>
  Object.fromEntries(
    buildEnvLinkGroups(e).flatMap((g) => g.links.map((l) => [l.label, l.url])),
  )

describe('buildEnvLinkGroups', () => {
  it('builds System, Maker/Automate and Admin groups', () => {
    const titles = buildEnvLinkGroups(env()).map((g) => g.title)
    expect(titles).toEqual(['System', 'Maker / Automate', 'Admin (Power Platform)'])
  })

  it('derives org-relative links from the environment url', () => {
    const l = linksOf(env())
    const base = 'https://operations-d365-schulz-int-11.crm4.dynamics.com'
    expect(l['System (Unified Interface)']).toBe(base)
    expect(l['OData / Web API v9.2']).toBe(`${base}/api/data/v9.2/`)
    expect(l['Diagnostics']).toBe(`${base}/tools/diagnostics/diag.aspx`)
    expect(l['Advanced Settings (classic)']).toBe(`${base}/main.aspx?settingsonly=true`)
  })

  it('trims a trailing slash on the org url before appending paths', () => {
    const l = linksOf(env({ url: 'https://org.crm4.dynamics.com/' }))
    expect(l['OData / Web API v9.2']).toBe('https://org.crm4.dynamics.com/api/data/v9.2/')
  })

  it('builds maker and admin deep links from the environment id', () => {
    const l = linksOf(env())
    const id = '431783f6-367c-eb49-984b-4e70e4c0424d'
    expect(l['Maker — Solutions']).toBe(`https://make.powerapps.com/environments/${id}/solutions`)
    expect(l['Power Automate — Flows']).toBe(`https://make.powerautomate.com/environments/${id}/flows`)
    expect(l['Environment Hub']).toBe(
      `https://admin.powerplatform.microsoft.com/manage/environments/environment/${id}/hub`,
    )
  })

  it('omits maker/admin groups when the environment id is missing', () => {
    const titles = buildEnvLinkGroups(env({ environmentId: '' })).map((g) => g.title)
    expect(titles).toEqual(['System'])
  })

  it('omits the System group when the url is missing', () => {
    const titles = buildEnvLinkGroups(env({ url: '' })).map((g) => g.title)
    expect(titles).not.toContain('System')
  })
})

describe('buildGlobalLinks', () => {
  it('returns the admin center plus the governance links', () => {
    const labels = buildGlobalLinks().map((l) => l.label)
    expect(labels).toEqual([
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
