import { describe, expect, it } from 'vitest'
import type { PrincipalRef } from '../types/board'
import { matchesAll, rankPrincipals, searchWords } from './principalSearch'

const u = (name: string, detail = ''): PrincipalRef => ({ id: name, type: 'user', name, detail })
const people = [u('Björn Ostermann'), u('Brandt, Jörn (extern)'), u('Jörg Albrecht'), u('Jörn Brandt', 'joern.brandt@contoso.example')]

describe('principal search', () => {
  it('starts at 2 characters and splits words', () => {
    expect(searchWords('j')).toEqual([])
    expect(searchWords('  jör   bra ')).toEqual(['jör', 'bra'])
  })
  it('requires every word', () => {
    expect(people.filter((p) => matchesAll(p, ['jör', 'bra'])).map((p) => p.name)).toEqual(['Brandt, Jörn (extern)', 'Jörn Brandt'])
    expect(matchesAll(people[3], ['contoso'])).toBe(true)
  })
  it('ranks name-prefix matches first, then word-prefix, then the rest', () => {
    expect(rankPrincipals(people, 'jör').map((p) => p.name)).toEqual(['Jörg Albrecht', 'Jörn Brandt', 'Brandt, Jörn (extern)', 'Björn Ostermann'])
    expect(rankPrincipals(people, 'jörn bra').map((p) => p.name)[0]).toBe('Jörn Brandt')
  })
})
