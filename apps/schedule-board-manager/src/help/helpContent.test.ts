import { describe, expect, it } from 'vitest'
import { HELP_FOR, HELP_SECTIONS, searchHelp, sectionText } from './helpContent'

describe('help content', () => {
  it('has unique section ids and every deep link points to one', () => {
    const ids = HELP_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const target of Object.values(HELP_FOR)) expect(ids).toContain(target)
  })

  it('covers every board tab and top-level area', () => {
    for (const area of ['boards', 'compare', 'bulk', 'import', 'edit', 'design', 'json', 'filter', 'sharing', 'history']) {
      expect(HELP_FOR[area], area).toBeDefined()
    }
  })

  it('search needs every word and ignores markup', () => {
    expect(searchHelp('').length).toBe(HELP_SECTIONS.length)
    expect(searchHelp('konflikt').map((s) => s.id)).toContain('speichern')
    expect(searchHelp('baukasten fett').map((s) => s.id)).toEqual(expect.arrayContaining(['darstellung']))
    expect(searchHelp('xyzzy')).toEqual([])
    expect(sectionText(HELP_SECTIONS[0])).not.toContain('**')
  })
})
