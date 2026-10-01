import { describe, expect, it } from 'vitest'
import { cssColor, textOn, tint } from './colors'

describe('colors', () => {
  it('normalizes stored hex values', () => {
    expect(cssColor('0f6cbd')).toBe('#0F6CBD')
    expect(cssColor('#00A300')).toBe('#00A300')
    expect(cssColor('red')).toBeNull()
    expect(cssColor(null)).toBeNull()
  })
  it('tints towards white and picks readable text', () => {
    expect(tint('#000000', 0.5)).toBe('#808080')
    expect(tint('#0F6CBD', 0)).toBe('#0F6CBD')
    expect(textOn('#FFFFFF')).toBe('#1B1F2A')
    expect(textOn('#0F6CBD')).toBe('#FFFFFF')
  })
})
