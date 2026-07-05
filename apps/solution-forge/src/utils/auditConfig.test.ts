import { describe, expect, it } from 'vitest'
import { describeTableAudit, formatRetention } from './auditConfig'

describe('formatRetention', () => {
  it('formats forever / not-set / days / years', () => {
    expect(formatRetention(-1)).toBe('Forever')
    expect(formatRetention(0)).toBe('Not set')
    expect(formatRetention(1)).toBe('1 day')
    expect(formatRetention(90)).toBe('90 days')
    expect(formatRetention(365)).toBe('365 days (1 year)')
    expect(formatRetention(730)).toBe('730 days (2 years)')
  })
})

describe('describeTableAudit', () => {
  it('is effective only when org auditing and the table are both on', () => {
    expect(
      describeTableAudit({ auditingEnabled: true }, { auditEnabled: true }),
    ).toBe('effective')
  })
  it('flags a table configured for audit while org auditing is off', () => {
    expect(
      describeTableAudit({ auditingEnabled: false }, { auditEnabled: true }),
    ).toBe('configured-but-off')
  })
  it('reports a non-audited table regardless of the org switch', () => {
    expect(
      describeTableAudit({ auditingEnabled: true }, { auditEnabled: false }),
    ).toBe('not-audited')
    expect(
      describeTableAudit({ auditingEnabled: false }, { auditEnabled: false }),
    ).toBe('not-audited')
  })
})
