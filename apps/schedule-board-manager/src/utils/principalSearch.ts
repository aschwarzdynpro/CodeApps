import type { PrincipalRef } from '../types/board'

/** Max users per search; the UI says "keep typing" when it is reached. */
export const SEARCH_LIMIT = 25

/** Search words; the search starts once they hold at least 2 characters. */
export function searchWords(term: string): string[] {
  const words = term.trim().split(/\s+/).filter(Boolean)
  return words.join('').length >= 2 ? words : []
}

/** Client-side equivalent of the server filter: every word in name or detail. */
export function matchesAll(p: PrincipalRef, words: string[]): boolean {
  const hay = `${p.name} ${p.detail ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w.toLowerCase()))
}

/**
 * Prefix matches first: whole name starts with the text ("Jörn B…"), then any
 * word of the name starts with the first search word ("Busch, Jörn"); the
 * rest keeps server order.
 */
export function rankPrincipals(list: PrincipalRef[], term: string): PrincipalRef[] {
  const t = term.trim().toLowerCase()
  const first = t.split(/\s+/)[0] ?? ''
  const score = (p: PrincipalRef) => {
    const n = p.name.toLowerCase()
    if (n.startsWith(t)) return 0
    if (n.split(/[\s,]+/).some((w) => w.startsWith(first))) return 1
    return 2
  }
  return list
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.p)
}
