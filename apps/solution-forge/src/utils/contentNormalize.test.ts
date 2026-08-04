import { describe, expect, it } from 'vitest'
import { differsOnlyInLineEndings, normalizeContent } from './contentNormalize'

describe('normalizeContent', () => {
  it('folds CRLF to LF', () => {
    expect(normalizeContent('a\r\nb\r\nc')).toBe('a\nb\nc')
  })

  it('folds a lone CR to LF', () => {
    expect(normalizeContent('a\rb')).toBe('a\nb')
  })

  it('strips a leading byte-order mark', () => {
    expect(normalizeContent('\uFEFFif (x) {}')).toBe('if (x) {}')
  })

  it('leaves a BOM that is not at the start alone', () => {
    // Only the file-leading marker is an artefact; elsewhere it is content.
    expect(normalizeContent('a\uFEFFb')).toBe('a\uFEFFb')
  })

  it('keeps trailing spaces, blank lines and indentation', () => {
    // Those are edits, however cosmetic — the check exists to surface them.
    const text = 'a  \n\n    b\n'
    expect(normalizeContent(text)).toBe(text)
  })

  it('is idempotent', () => {
    const once = normalizeContent('a\r\nb')
    expect(normalizeContent(once)).toBe(once)
  })

  it('makes the real INT-11 / PROD case equal', () => {
    // The bytes observed at Schulz: identical script, LF vs CRLF.
    const int11 = 'if (typeof (Schulz) === "undefined") { Schulz = {}; };\nif'
    const prod = 'if (typeof (Schulz) === "undefined") { Schulz = {}; };\r\nif'
    expect(int11).not.toBe(prod)
    expect(normalizeContent(int11)).toBe(normalizeContent(prod))
  })
})

describe('differsOnlyInLineEndings', () => {
  it('is true for the LF / CRLF pair', () => {
    expect(differsOnlyInLineEndings('a\nb', 'a\r\nb')).toBe(true)
  })

  it('is false for identical text', () => {
    expect(differsOnlyInLineEndings('a\nb', 'a\nb')).toBe(false)
  })

  it('is false when the content really differs', () => {
    expect(differsOnlyInLineEndings('a\nb', 'a\r\nc')).toBe(false)
  })
})
