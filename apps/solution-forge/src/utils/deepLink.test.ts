import { describe, expect, it } from 'vitest'
import { DEEP_LINK_PARAM, buildDeepLink, deepLinkTarget } from './deepLink'

const KEYS = ['workbench', 'odata', 'roleCompare', 'importHistory'] as const

describe('deepLinkTarget', () => {
  it('reads a known workspace key', () => {
    expect(deepLinkTarget({ p: 'odata' }, KEYS)).toBe('odata')
  })

  it('returns the canonical key for a lower-cased link', () => {
    // Chat clients and ticket systems love to lower-case URLs.
    expect(deepLinkTarget({ p: 'rolecompare' }, KEYS)).toBe('roleCompare')
    expect(deepLinkTarget({ p: 'IMPORTHISTORY' }, KEYS)).toBe('importHistory')
  })

  it('tolerates surrounding whitespace', () => {
    expect(deepLinkTarget({ p: '  odata ' }, KEYS)).toBe('odata')
  })

  it('returns null for an unknown key', () => {
    // A link to a workspace that was renamed or removed must degrade, not throw.
    expect(deepLinkTarget({ p: 'doesNotExist' }, KEYS)).toBeNull()
  })

  it('returns null when the parameter is missing, empty or not a string', () => {
    expect(deepLinkTarget({}, KEYS)).toBeNull()
    expect(deepLinkTarget({ p: '' }, KEYS)).toBeNull()
    expect(deepLinkTarget({ p: '   ' }, KEYS)).toBeNull()
    expect(deepLinkTarget({ other: 'odata' }, KEYS)).toBeNull()
    expect(deepLinkTarget(null, KEYS)).toBeNull()
    expect(deepLinkTarget(undefined, KEYS)).toBeNull()
    expect(deepLinkTarget({ p: 7 } as unknown as Record<string, string>, KEYS)).toBeNull()
  })

  it('uses the exported parameter name', () => {
    expect(deepLinkTarget({ [DEEP_LINK_PARAM]: 'odata' }, KEYS)).toBe('odata')
  })
})

describe('buildDeepLink', () => {
  it('composes the play URL and hides the player chrome', () => {
    expect(buildDeepLink('app-1', 'env-1', 'odata')).toBe(
      'https://apps.powerapps.com/play/e/env-1/app/app-1?p=odata&hidenavbar=true',
    )
  })

  it('encodes the parts', () => {
    expect(buildDeepLink('a b', 'e/1', 'x y')).toBe(
      'https://apps.powerapps.com/play/e/e%2F1/app/a%20b?p=x%20y&hidenavbar=true',
    )
  })

  it('returns an empty string when an id is missing', () => {
    // Standalone on mock data there is no app to link to — better no button
    // than a URL with "undefined" in it.
    expect(buildDeepLink(null, 'env-1', 'odata')).toBe('')
    expect(buildDeepLink('app-1', null, 'odata')).toBe('')
    expect(buildDeepLink('app-1', 'env-1', '')).toBe('')
    expect(buildDeepLink(undefined, undefined, 'odata')).toBe('')
  })
})
