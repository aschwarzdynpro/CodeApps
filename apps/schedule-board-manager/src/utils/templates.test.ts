import { describe, expect, it } from 'vitest'
import { renderTemplate } from './handlebarsLite'
import {
  DEFAULT_ALERT_TEMPLATE,
  DEFAULT_BOOKING_TEMPLATE,
  STARTER_CELL_TEMPLATE,
  URS_PARTIALS,
  cellVariables,
  fieldPlaceholders,
  lintTemplate,
  parseSample,
  renderFieldTemplate,
  resolveTemplate,
  sampleFor,
  ursHelpers,
} from './templates'

describe('field templates', () => {
  it('finds placeholders and ignores Handlebars and CSS braces', () => {
    const tpl = '<style>.x { color: red }</style>{name} {a.b_c.d} {{notme}} {name}'
    expect(fieldPlaceholders(tpl)).toEqual(['name', 'a.b_c.d'])
  })

  it('renders escaped values', () => {
    expect(renderFieldTemplate('<b>{name}</b> {{x}}', () => '<i>&</i>')).toBe('<b>&lt;i&gt;&amp;&lt;/i&gt;</b> {{x}}')
  })

  it('knows the product defaults', () => {
    expect(fieldPlaceholders(DEFAULT_BOOKING_TEMPLATE)).toEqual(['SchedulableEntityDisplayName', 'name', 'duration'])
    expect(fieldPlaceholders(DEFAULT_ALERT_TEMPLATE)).toEqual([
      'msdyn_msdyn_bookingalert_msdyn_bookingalertstatus_BookingAlert.subject',
      'msdyn_nexttimetoshow',
      'msdyn_msdyn_bookingalert_msdyn_bookingalertstatus_BookingAlert.description',
    ])
  })
})

describe('lintTemplate', () => {
  it('flags script, handlers and the wrong brace style', () => {
    const levels = (tpl: string, kind: 'booking' | 'cell') => lintTemplate(tpl, kind).map((l) => l.level)
    expect(levels('<script>x()</script>', 'booking')).toEqual(['error'])
    expect(levels('<img onerror="x()">', 'cell')).toEqual(['error'])
    expect(levels('{{name}}', 'booking')).toEqual(['warn'])
    expect(levels('{name}', 'cell')).toEqual(['warn'])
    expect(lintTemplate(DEFAULT_BOOKING_TEMPLATE, 'booking')).toEqual([])
    expect(lintTemplate(STARTER_CELL_TEMPLATE, 'cell')).toEqual([])
  })
  it('points to the sanitizing setting for CSS blocks and icons', () => {
    const lints = lintTemplate('<i class="fa fa-star"></i>', 'booking')
    expect(lints.map((l) => l.level)).toEqual(['info', 'info'])
  })
})

describe('cell template', () => {
  it('renders the starter template in board and Schedule Assistant view', () => {
    const ctx = { name: 'Mara', imagepath: '', BookedDuration: '6:30', BookedPercentage: 81, ResourceCellSelected: true }
    const board = renderTemplate(STARTER_CELL_TEMPLATE, ctx, { helpers: ursHelpers({ saGridView: false }), partials: URS_PARTIALS })
    const sa = renderTemplate(STARTER_CELL_TEMPLATE, ctx, { helpers: ursHelpers({ saGridView: true }), partials: URS_PARTIALS })
    expect(board.ok && sa.ok).toBe(true)
    if (!board.ok || !sa.ok) return
    expect(board.issues).toEqual([])
    expect(board.html).toContain('resource-cell-selected')
    expect(board.html).toContain('81%')
    expect(board.html).toContain('resource-map-pin')
    expect(sa.html).not.toContain('81%')
  })
  it('lists the variables the starter template reads', () => {
    expect(cellVariables(STARTER_CELL_TEMPLATE)).toEqual([
      'ResourceCellSelected',
      'ResourceUnavailable',
      'IsMatchingAvailability',
      'imagepath',
      'name',
      'BookedDuration',
      'BookedPercentage',
    ])
  })
  it('parses typed samples', () => {
    expect(parseSample('false')).toBe(false)
    expect(parseSample(' 12 ')).toBe(12)
    expect(parseSample('Text')).toBe('Text')
  })
})

describe('sampleFor', () => {
  it('derives names from the relationship path', () => {
    expect(sampleFor('name')).toBe('Wartung Heizungsanlage')
    expect(sampleFor('msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_name')).toBe('WO-00042')
    expect(sampleFor('a.msdyn_account_msdyn_workorder_ServiceAccount.name')).toBe('Contoso Haustechnik')
    expect(sampleFor('SchedulableEntityDisplayName', { entityLabel: 'Projekt' })).toBe('Projekt')
    expect(sampleFor('duration', { durationMinutes: 45 })).toBe('45')
    expect(sampleFor('pro_custom')).toBe('‹pro_custom›')
    expect(sampleFor('msdyn_msdyn_resourcerequirement_bookableresourcebooking_ResourceRequirement.msdyn_name')).toBe('Anforderung Heizungswartung')
    expect(sampleFor('name', { entity: 'bookableresource' })).toBe('Mara Lindqvist')
  })
})

describe('resolveTemplate', () => {
  it('prefers own, then Default board, then product', () => {
    expect(resolveTemplate('<b/>', '<b/>', '<i/>', 'P')).toEqual({ source: 'own', text: '<b/>' })
    expect(resolveTemplate(undefined, undefined, '<i/>', 'P')).toEqual({ source: 'inherited', text: '<i/>' })
    expect(resolveTemplate(undefined, undefined, undefined, 'P')).toEqual({ source: 'product', text: 'P' })
  })
  it('treats a stored empty string as unset, a freshly cleared one as own', () => {
    expect(resolveTemplate('', '', undefined, 'P').source).toBe('product')
    expect(resolveTemplate('', '<b/>', undefined, 'P')).toEqual({ source: 'own', text: '' })
  })
})
