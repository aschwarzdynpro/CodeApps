import { describe, expect, it } from 'vitest'
import { HELP_FOR, HELP_SECTIONS, searchHelp, sectionText } from './helpContent'

describe('help content', () => {
  it('has unique section ids and every deep link points to one', () => {
    const ids = HELP_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const target of Object.values(HELP_FOR)) expect(ids).toContain(target)
  })

  it('covers every area of the navigation', () => {
    for (const view of ['resources', 'templates', 'holidays', 'diagnostics', 'runs', 'setup']) expect(HELP_FOR[view], view).toBeDefined()
  })

  it('search needs every word and ignores markup', () => {
    expect(searchHelp('').length).toBe(HELP_SECTIONS.length)
    expect(searchHelp('nachtschicht').map((s) => s.id)).toContain('bearbeiten')
    expect(searchHelp('snapshot rückgängig').map((s) => s.id)).toEqual(['massenlauf'])
    expect(searchHelp('xyzzy')).toEqual([])
    expect(sectionText(HELP_SECTIONS[0])).not.toContain('**')
  })
})
