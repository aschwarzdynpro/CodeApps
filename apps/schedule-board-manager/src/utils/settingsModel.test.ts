import { describe, expect, it } from 'vitest'
import {
  flatten,
  getAt,
  jsonEqual,
  parseSettings,
  readFlag,
  serializeSettings,
  setAt,
  writeFlag,
  type JsonObject,
} from './settingsModel'

const RAW =
  '{"BookingAlertTemplate":"<b>x</b>","GroupResourcesBy":"-1","SlotMetadataCollection":[{"BookingSetupMetadataId":"49bc","TooltipViewId":"a"},{"BookingSetupMetadataId":"d59d","TooltipViewId":"b"}],"WorkHours":{"end":19,"start":6},"hideCancelled":1,"viewModeSpecific":{"hourAndDay":{"RowHeight":80}}}'

function parsed(): JsonObject {
  const r = parseSettings(RAW)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('parseSettings', () => {
  it('treats empty as empty object', () => {
    expect(parseSettings(null)).toEqual({ ok: true, value: {} })
    expect(parseSettings('  ')).toEqual({ ok: true, value: {} })
  })
  it('rejects non-objects and broken JSON', () => {
    expect(parseSettings('[1]').ok).toBe(false)
    expect(parseSettings('{').ok).toBe(false)
  })
})

describe('setAt', () => {
  it('changes one path and keeps everything else byte-identical', () => {
    const next = setAt(parsed(), ['WorkHours', 'start'], 7)
    expect(serializeSettings(next)).toBe(RAW.replace('"start":6', '"start":7'))
  })
  it('does not mutate the input', () => {
    const before = parsed()
    setAt(before, ['WorkHours', 'start'], 7)
    expect(getAt(before, ['WorkHours', 'start'])).toBe(6)
  })
  it('creates missing intermediate objects', () => {
    const next = setAt(parsed(), ['viewModeSpecific', 'dayAndWeek', 'RowHeight'], 64)
    expect(getAt(next, ['viewModeSpecific', 'dayAndWeek', 'RowHeight'])).toBe(64)
    expect(getAt(next, ['viewModeSpecific', 'hourAndDay', 'RowHeight'])).toBe(80)
  })
  it('addresses array elements by index', () => {
    const next = setAt(parsed(), ['SlotMetadataCollection', 1, 'TooltipViewId'], 'c')
    expect(getAt(next, ['SlotMetadataCollection', 1, 'TooltipViewId'])).toBe('c')
    expect(getAt(next, ['SlotMetadataCollection', 0, 'TooltipViewId'])).toBe('a')
  })
  it('removes keys and array elements with undefined', () => {
    expect('hideCancelled' in setAt(parsed(), ['hideCancelled'], undefined)).toBe(false)
    const arr = getAt(setAt(parsed(), ['SlotMetadataCollection', 0], undefined), ['SlotMetadataCollection'])
    expect(arr).toHaveLength(1)
  })
})

describe('presence flags', () => {
  it('reads 1/true as on, absence as off', () => {
    expect(readFlag(parsed(), ['hideCancelled'])).toBe(true)
    expect(readFlag(parsed(), ['showTravelTime'])).toBe(false)
  })
  it('removes the key when switched off instead of writing 0', () => {
    const off = writeFlag(parsed(), ['hideCancelled'], false, 1)
    expect('hideCancelled' in off).toBe(false)
    const on = writeFlag(off, ['showBookingsProportionally'], true, true)
    expect(on.showBookingsProportionally).toBe(true)
  })
})

describe('flatten / jsonEqual', () => {
  it('keys slot metadata by BookingSetupMetadataId', () => {
    const keys = flatten(parsed()).map((e) => e.key)
    expect(keys).toContain('SlotMetadataCollection[d59d].TooltipViewId')
    expect(keys).toContain('WorkHours.start')
  })
  it('ignores key order', () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 1, b: null })).toBe(false)
  })
})
