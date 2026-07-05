import { describe, expect, it } from 'vitest'
import {
  actionFromAccessRight,
  actionFromPrivilegeName,
  depthFromMask,
  depthLabel,
  depthShort,
  maxDepth,
} from './privileges'

describe('actionFromAccessRight', () => {
  it('maps the AccessRights bits to matrix actions', () => {
    expect(actionFromAccessRight(32)).toBe('Create')
    expect(actionFromAccessRight(1)).toBe('Read')
    expect(actionFromAccessRight(2)).toBe('Write')
    expect(actionFromAccessRight(65536)).toBe('Delete')
    expect(actionFromAccessRight(4)).toBe('Append')
    expect(actionFromAccessRight(16)).toBe('AppendTo')
    expect(actionFromAccessRight(524288)).toBe('Assign')
    expect(actionFromAccessRight(262144)).toBe('Share')
  })

  it('returns null for misc privileges (accessright 0 / unknown)', () => {
    expect(actionFromAccessRight(0)).toBeNull()
    expect(actionFromAccessRight(1234)).toBeNull()
  })
})

describe('actionFromPrivilegeName', () => {
  it('derives the action from the canonical prv name', () => {
    expect(actionFromPrivilegeName('prvDeleteAccount')).toBe('Delete')
    expect(actionFromPrivilegeName('prvReadContact')).toBe('Read')
    // AppendTo must win over the Append prefix.
    expect(actionFromPrivilegeName('prvAppendToAccount')).toBe('AppendTo')
    expect(actionFromPrivilegeName('prvAppendAccount')).toBe('Append')
  })

  it('returns null for non-CRUD privileges', () => {
    expect(actionFromPrivilegeName('prvExportToExcel')).toBeNull()
    expect(actionFromPrivilegeName('prvBulkDelete')).toBeNull()
  })
})

describe('depthFromMask', () => {
  it('decodes the single stored bit', () => {
    expect(depthFromMask(1)).toBe(1)
    expect(depthFromMask(2)).toBe(2)
    expect(depthFromMask(4)).toBe(4)
    expect(depthFromMask(8)).toBe(8)
    expect(depthFromMask(0)).toBe(0)
  })

  it('picks the deepest bit from combined masks (defensive)', () => {
    expect(depthFromMask(1 | 8)).toBe(8)
    expect(depthFromMask(1 | 2)).toBe(2)
  })
})

describe('depth helpers', () => {
  it('maxDepth returns the deeper grant', () => {
    expect(maxDepth(1, 8)).toBe(8)
    expect(maxDepth(4, 2)).toBe(4)
    expect(maxDepth(0, 0)).toBe(0)
  })

  it('labels match the classic role editor wording', () => {
    expect(depthShort(2)).toBe('BU')
    expect(depthShort(0)).toBe('—')
    expect(depthLabel(4)).toBe('Parent: Child BUs')
    expect(depthLabel(0)).toBe('None')
  })
})
