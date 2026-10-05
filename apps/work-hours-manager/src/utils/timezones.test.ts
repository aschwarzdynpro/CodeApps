import { describe, expect, it } from 'vitest'
import { TIME_ZONES, codeOf, ianaOf, timeZoneLabel, timeZoneOptions } from './timezones'

describe('timezones', () => {
  it('maps the codes of the API documentation', () => {
    expect(ianaOf(110)).toBe('Europe/Berlin')
    expect(ianaOf(92)).toBe('UTC')
    expect(ianaOf(35)).toBe('America/New_York')
    expect(codeOf('Europe/Berlin')).toBe(110)
    expect(codeOf('Europe/Paris')).toBe(105)
    expect(codeOf('Mars/Olympus')).toBeNull()
  })

  it('falls back to Berlin for unknown codes', () => {
    expect(ianaOf(9999)).toBe('Europe/Berlin')
    expect(ianaOf(null)).toBe('Europe/Berlin')
  })

  it('has unique codes and valid IANA zones', () => {
    expect(new Set(TIME_ZONES.map((z) => z.code)).size).toBe(TIME_ZONES.length)
    for (const z of TIME_ZONES) expect(() => new Intl.DateTimeFormat('en-US', { timeZone: z.iana })).not.toThrow()
  })

  it('labels zones briefly and lists common ones first', () => {
    expect(timeZoneLabel(110)).toBe('Berlin (GMT+01:00)')
    expect(timeZoneLabel(85)).toBe('London (GMT+00:00)')
    expect(timeZoneLabel(999)).toBe('Code 999')
    expect(timeZoneOptions()[0].code).toBe(110)
  })
})
