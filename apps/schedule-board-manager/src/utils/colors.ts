/**
 * Board colors are stored as 6-digit hex without '#'. The previews need
 * them as CSS colors, a light tint for booking tiles and a readable text
 * color on top.
 */

const HEX = /^#?([0-9a-f]{6})$/i

/** `'0F6CBD'` or `'#0f6cbd'` → `'#0F6CBD'`; anything else → null. */
export function cssColor(value: string | null | undefined): string | null {
  const m = HEX.exec((value ?? '').trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mixes `hex` with white; `amount` 0 = unchanged, 1 = white. */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex).map((c) => Math.round(c + (255 - c) * amount))
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function textOn(hex: string): '#1B1F2A' | '#FFFFFF' {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#1B1F2A' : '#FFFFFF'
}
