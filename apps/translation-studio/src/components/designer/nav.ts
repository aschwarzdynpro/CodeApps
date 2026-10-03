import { createContext } from 'react'

/**
 * Moving between gaps on a canvas. Labels render with `data-label` and
 * `data-gap="1"` when missing or probably untranslated; navigation follows
 * the document order of the canvas, so it walks the form the way a reader
 * does (header, tabs, sections, fields).
 *
 * Only the visible part is in the DOM (one form tab, one app area). When it
 * has no gap left in the direction of travel, the canvas gets a chance to
 * switch to the next tab/area with gaps ({@link CanvasNav}) before the
 * search wraps around.
 */

const GAP = '[data-label][data-gap="1"]'

/** Switches the canvas to the next part with gaps in `dir`; true when it did (and will focus a gap there). */
export type Exhausted = (dir: 1 | -1) => boolean

/** Provided by canvases with parts that aren't rendered at once (form tabs, app areas). */
export const CanvasNav = createContext<Exhausted | null>(null)

/** Next (dir 1) or previous (dir -1) gap after `from`, optionally wrapping around. */
export function findGap(root: Element, from: Element | null, dir: 1 | -1, wrap = true): HTMLElement | null {
  const gaps = Array.from(root.querySelectorAll<HTMLElement>(GAP)).filter((el) => !from || !el.contains(from))
  if (gaps.length === 0) return null
  if (!from) return dir === 1 ? gaps[0] : gaps[gaps.length - 1]
  const after = gaps.filter((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  const before = gaps.filter((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
  if (dir === 1) return after[0] ?? (wrap ? before[0] : undefined) ?? null
  return before[before.length - 1] ?? (wrap ? after[after.length - 1] : undefined) ?? null
}

/** Opens the label for editing (its text acts as button) and scrolls it into view. */
export function openLabel(el: HTMLElement): void {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.querySelector<HTMLElement>('[data-open]')?.click()
}

/** The label the user is on: the open editor, else the selected label. */
export function currentLabel(root: Element): Element | null {
  return root.querySelector('.lt--editing') ?? root.querySelector('.lt--selected')
}

/**
 * Jumps from `from` to the next/previous gap of the canvas; lets the canvas
 * switch tab/area first when the visible part is done. False when there is
 * no gap anywhere.
 */
export function jumpToGap(from: Element | null, dir: 1 | -1, root?: Element | null, onExhausted?: Exhausted | null): boolean {
  const canvas = root ?? from?.closest('[data-canvas]') ?? document.querySelector('[data-canvas]')
  if (!canvas) return false
  const start = from && canvas.contains(from) ? from : null
  const next = findGap(canvas, start, dir, false)
  if (next) {
    openLabel(next)
    return true
  }
  if (onExhausted?.(dir)) return true
  const wrapped = findGap(canvas, start, dir, true)
  if (!wrapped) return false
  openLabel(wrapped)
  return true
}

/** After a tab/area switch has rendered: open the first (dir 1) or last gap inside `part()`. */
export function jumpAfterRender(part: () => Element | null | undefined, dir: 1 | -1): void {
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const root = part()
      const target = root ? findGap(root, null, dir) : null
      if (target) openLabel(target)
    }),
  )
}
