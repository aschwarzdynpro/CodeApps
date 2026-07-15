import { describe, expect, it } from 'vitest'
import { lcidName } from './lcid'

describe('lcidName', () => {
  it('resolves common LCIDs to a readable name', () => {
    expect(lcidName(1031)).toBe('German (de-DE)')
    expect(lcidName(1033)).toBe('English (en-US)')
    expect(lcidName(2057)).toBe('English (en-GB)')
  })
  it('falls back to #<lcid> for unknown codes', () => {
    expect(lcidName(9999)).toBe('#9999')
  })
  it('shows a dash for 0 / empty', () => {
    expect(lcidName(0)).toBe('—')
  })
})
