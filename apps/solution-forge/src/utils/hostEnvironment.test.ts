import { describe, expect, it } from 'vitest'
import { isRealEnvironmentId, resolveHostEnvironmentId } from './hostEnvironment'
import type { EnvironmentDef } from '../types/comparison'

const HOST = '11111111-2222-4333-8444-555555555555'
const CONFIGURED = '66666666-7777-4888-8999-aaaaaaaaaaaa'

const env = (over: Partial<EnvironmentDef> = {}): EnvironmentDef => ({
  key: 'dev',
  label: 'DEV',
  url: 'https://contoso-dev.crm4.dynamics.com',
  environmentId: CONFIGURED,
  isCurrent: true,
  ...over,
})

describe('isRealEnvironmentId', () => {
  it('accepts a GUID and the Default-<tenant> form', () => {
    expect(isRealEnvironmentId(HOST)).toBe(true)
    expect(isRealEnvironmentId(`Default-${HOST}`)).toBe(true)
  })

  it('rejects empty values, non-GUIDs and the all-zero placeholders', () => {
    expect(isRealEnvironmentId(null)).toBe(false)
    expect(isRealEnvironmentId('')).toBe(false)
    expect(isRealEnvironmentId('dev')).toBe(false)
    expect(isRealEnvironmentId('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(isRealEnvironmentId('00000000-0000-0000-0000-000000000002')).toBe(false)
  })
})

describe('resolveHostEnvironmentId', () => {
  it('prefers the id the host reported', () => {
    expect(resolveHostEnvironmentId(HOST, [env()], true)).toBe(HOST)
  })

  it('falls back to the current row of the runtime config', () => {
    expect(resolveHostEnvironmentId(null, [env()], true)).toBe(CONFIGURED)
  })

  it('never trusts the build-time list — that is the value a release carries', () => {
    expect(resolveHostEnvironmentId(null, [env()], false)).toBeNull()
  })

  it('only takes a row that is flagged current, not simply the first', () => {
    const rows = [env({ key: 'uat', isCurrent: false })]
    expect(resolveHostEnvironmentId(null, rows, true)).toBeNull()
  })

  it('returns null rather than a placeholder', () => {
    const rows = [env({ environmentId: '00000000-0000-0000-0000-000000000000' })]
    expect(resolveHostEnvironmentId('', rows, true)).toBeNull()
  })
})
