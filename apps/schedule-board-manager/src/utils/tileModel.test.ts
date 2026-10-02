import { describe, expect, it } from 'vitest'
import { fieldLabel, parseTile, serializeTile, tileEditable } from './tileModel'
import { DEFAULT_ALERT_TEMPLATE, DEFAULT_BOOKING_TEMPLATE } from './templates'

// Shaped like real templates: wrapper with style, one line per row, emoji labels, trailing <br/>.
const MULTILINE = `<div style="line-height: 13px !important; width: 100%; overflow: hidden;">
    {msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_name}: <b>{msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_workordersummary}</b><br/>
    🙋: <b>{msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_account_msdyn_workorder_ServiceAccount.name}</b><br/>
    🕝: <b>{duration}</b><br/>
</div>`

describe('tile model', () => {
  it('reads the product default into lines and writes it back unchanged', () => {
    const m = parseTile(DEFAULT_BOOKING_TEMPLATE)!
    expect(m.lines.length).toBe(2)
    expect(m.lines[0].segments.map((s) => (s.kind === 'field' ? `{${s.path}}` : s.text))).toEqual(['{SchedulableEntityDisplayName}', ' - ', '{name}'])
    expect(m.lines[1].segments.at(-1)).toEqual({ kind: 'field', path: 'duration', bold: true })
    expect(serializeTile(m)).toBe(DEFAULT_BOOKING_TEMPLATE)
  })

  it('keeps wrapper style, indent, <br/> spelling and the trailing break', () => {
    const m = parseTile(MULTILINE)!
    expect(m.lines.length).toBe(3)
    expect(m.trailingBreak).toBe(true)
    expect(m.lines[1].segments).toEqual([
      { kind: 'text', text: '🙋: ', bold: false },
      { kind: 'field', path: 'msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_account_msdyn_workorder_ServiceAccount.name', bold: true },
    ])
    expect(serializeTile(m)).toBe(MULTILINE)
  })

  it('writes an edit as just that edit', () => {
    const m = parseTile(MULTILINE)!
    m.lines.splice(1, 1)
    const out = serializeTile(m)
    expect(out).not.toContain('🙋')
    expect(out.split('\n').length).toBe(MULTILINE.split('\n').length - 1)
  })

  it('keeps a typed space at the end of a line', () => {
    const m = parseTile('<div>Dauer: </div>')!
    expect(m.lines[0].segments).toEqual([{ kind: 'text', text: 'Dauer: ', bold: false }])
    expect(serializeTile(m)).toBe('<div>Dauer: </div>')
  })

  it('handles bold labels (alert template)', () => {
    expect(tileEditable(DEFAULT_ALERT_TEMPLATE)).not.toBeNull()
  })

  it('refuses what it cannot represent', () => {
    expect(tileEditable('<div><span>{name}</span></div>')).toBeNull()
    expect(tileEditable('<div><div>{name}</div></div>')).toBeNull()
    expect(tileEditable('<b>{a}</b><strong>{b}</strong>')).toBeNull()
    expect(tileEditable('<img src="x" />{name}')).toBeNull()
  })

  it('labels placeholder paths readably', () => {
    expect(fieldLabel('msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_account_msdyn_workorder_ServiceAccount.name')).toBe(
      'WorkOrder › ServiceAccount › name',
    )
    expect(fieldLabel('duration')).toBe('duration')
    expect(fieldLabel('x', [{ path: 'x', label: 'Ex' }])).toBe('Ex')
  })
})
