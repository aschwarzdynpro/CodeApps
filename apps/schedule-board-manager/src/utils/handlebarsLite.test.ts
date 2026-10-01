import { describe, expect, it } from 'vitest'
import { escapeHtml, renderTemplate, templateVariables } from './handlebarsLite'

const render = (tpl: string, ctx: Record<string, unknown> = {}, helpers = {}) => {
  const r = renderTemplate(tpl, ctx, { helpers })
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('renderTemplate', () => {
  it('escapes double mustaches and keeps triple ones raw', () => {
    expect(render('{{a}}|{{{a}}}|{{& a}}', { a: '<b>"x"</b>' }).html).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;|<b>"x"</b>|<b>"x"</b>')
  })

  it('drops comments and resolves dotted paths', () => {
    expect(render('{{! note }}{{!-- {{x}} --}}{{a.b}}', { a: { b: 1 } }).html).toBe('1')
  })

  it('handles if/else, else if and unless', () => {
    const tpl = '{{#if a}}A{{else if b}}B{{else}}C{{/if}}{{#unless a}}!{{/unless}}'
    expect(render(tpl, { a: true }).html).toBe('A')
    expect(render(tpl, { b: 1 }).html).toBe('B!')
    expect(render(tpl, { a: 0, b: '' }).html).toBe('C!')
  })

  it('iterates with each and exposes @index, this and ../', () => {
    const tpl = '{{#each items}}{{@index}}:{{this}}{{../sep}}{{else}}leer{{/each}}'
    expect(render(tpl, { items: ['a', 'b'], sep: ';' }).html).toBe('0:a;1:b;')
    expect(render(tpl, { items: [] }).html).toBe('leer')
  })

  it('evaluates helpers and subexpressions', () => {
    const helpers = {
      eq: (a: unknown, b: unknown) => a === b,
      iif: (c: unknown, a: unknown, b: unknown) => (c ? a : b),
      'is-sa-grid-view': () => false,
    }
    const tpl = `<div class='{{iif sel "on" ""}}'>{{#if (eq (is-sa-grid-view) false) }}board{{/if}}</div>`
    expect(render(tpl, { sel: true }, helpers).html).toBe(`<div class='on'>board</div>`)
  })

  it('reports unknown helpers and partials instead of guessing', () => {
    const r = renderTemplate('{{format x "d"}}{{> pin this}}', { x: 1 }, { partials: {} })
    expect(r.ok && r.html).toBe('')
    expect(r.ok && r.issues.length).toBe(2)
  })

  it('renders known partials verbatim', () => {
    const r = renderTemplate('{{> pin this }}', {}, { partials: { pin: '<i></i>' } })
    expect(r.ok && r.html).toBe('<i></i>')
  })

  it('fails with a line number on broken syntax', () => {
    const unclosed = renderTemplate('a\n{{#if x}}b', {})
    expect(unclosed.ok).toBe(false)
    expect(!unclosed.ok && unclosed.error).toMatch(/nicht geschlossen.*Zeile 2/)
    const wrong = renderTemplate('{{#if x}}{{/each}}', {})
    expect(!wrong.ok && wrong.error).toMatch(/erwartet/)
    expect(renderTemplate('{{x', {}).ok).toBe(false)
    expect(renderTemplate('{{/if}}', {}).ok).toBe(false)
  })

  it('renders the Microsoft cost sample without issues', () => {
    const tpl = `<div class='resource-card-wrapper {{iif ResourceCellSelected "resource-cell-selected" ""}}'>
    {{#if imagepath}}<img class='resource-image' src='{{client-url}}{{imagepath}}' />{{else}}<div class='resource-image unknown-resource'></div>{{/if}}
    <div class="resourcecost" style="width: {{resourcecost}}0%;"></div>
    {{#if (eq (is-sa-grid-view) false) }}<div class='booked-percentage'>{{BookedPercentage}}%</div>{{/if}}
    {{#if (eq (is-sa-grid-view) false) }}{{> resource-map-pin-template this }}{{/if}}</div>`
    const r = renderTemplate(
      tpl,
      { ResourceCellSelected: false, imagepath: '', resourcecost: 4, BookedPercentage: 81 },
      {
        helpers: { iif: (c, a, b) => (c ? a : b), eq: (a, b) => a === b, 'client-url': () => '', 'is-sa-grid-view': () => false },
        partials: { 'resource-map-pin-template': '<pin/>' },
      },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.issues).toEqual([])
    expect(r.html).toContain('width: 40%')
    expect(r.html).toContain('unknown-resource')
    expect(r.html).toContain('81%')
    expect(r.html).toContain('<pin/>')
  })
})

describe('templateVariables', () => {
  it('lists root variables, not helpers, data or item paths', () => {
    const tpl = '{{name}}{{iif sel "a" b}}{{#if (eq (mode) x)}}{{y.z}}{{/if}}{{#each list}}{{inner}}{{/each}}{{@index}}{{this}}'
    expect(templateVariables(tpl, ['iif', 'eq', 'mode'])).toEqual(['name', 'sel', 'b', 'x', 'y', 'list'])
  })
  it('returns nothing for broken templates', () => {
    expect(templateVariables('{{#if a}}')).toEqual([])
  })
})

describe('escapeHtml', () => {
  it('escapes the Handlebars set', () => {
    expect(escapeHtml(`&<>"'\`=`)).toBe('&amp;&lt;&gt;&quot;&#x27;&#x60;&#x3D;')
  })
})
