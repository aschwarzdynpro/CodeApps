// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { currentLabel, findGap, jumpToGap, markCurrent } from './nav'

let opened: string | undefined

function canvas(html: string): HTMLElement {
  document.body.innerHTML = `<div data-canvas="1">${html}</div>`
  // jsdom has no layout: scrolling is a no-op.
  Element.prototype.scrollIntoView = () => {}
  for (const el of document.querySelectorAll<HTMLElement>('[data-open]')) el.addEventListener('click', () => (opened = el.parentElement!.id))
  return document.querySelector('[data-canvas]')!
}

const label = (id: string, gap: boolean, extra = '') =>
  `<span id="${id}" class="lt ${extra}" data-label="1" ${gap ? 'data-gap="1"' : ''}><span data-open="1">${id}</span></span>`

describe('gap navigation', () => {
  it('finds the next and previous gap, wrapping only when asked', () => {
    const root = canvas(label('a', true) + label('b', false) + label('c', true))
    const a = root.querySelector('#a')!
    const c = root.querySelector('#c')!
    expect(findGap(root, a, 1)?.id).toBe('c')
    expect(findGap(root, c, 1, false)).toBeNull()
    expect(findGap(root, c, 1, true)?.id).toBe('a')
    expect(findGap(root, a, -1, false)).toBeNull()
    expect(findGap(root, null, -1)?.id).toBe('c')
  })

  it('lets the canvas switch tab before wrapping, and wraps when it declines', () => {
    const root = canvas(label('a', true) + label('b', true))
    const b = root.querySelector('#b')!
    const switchTab = vi.fn(() => true)
    expect(jumpToGap(b, 1, root, switchTab)).toBe(true)
    expect(switchTab).toHaveBeenCalledWith(1)
    const decline = vi.fn(() => false)
    opened = undefined
    expect(jumpToGap(b, 1, root, decline)).toBe(true)
    expect(opened).toBe('a')
  })

  it('starts from the open editor, else from the selected label', () => {
    const root = canvas(label('a', true) + label('b', false, 'lt--selected') + label('c', true, 'lt--editing'))
    expect(currentLabel(root)?.id).toBe('c')
    root.querySelector('#c')!.classList.remove('lt--editing')
    expect(currentLabel(root)?.id).toBe('b')
    expect(jumpToGap(currentLabel(root), 1, root)).toBe(true)
    expect(opened).toBe('c')
  })

  it('starts from the copy the user activated, not from an echo of the same label', () => {
    // The title (an echo) and the name card show the same selected row.
    const root = canvas(label('title', false, 'lt--selected" data-echo="1') + label('card', false, 'lt--selected') + label('x', true))
    expect(currentLabel(root)?.id).toBe('card')
    markCurrent(root.querySelector('#title'))
    expect(currentLabel(root)?.id).toBe('title')
    markCurrent(root.querySelector('#card'))
    expect(root.querySelectorAll('[data-current]')).toHaveLength(1)
    expect(currentLabel(root)?.id).toBe('card')
  })
})
