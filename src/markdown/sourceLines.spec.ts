import { describe, expect, it } from 'vitest'

import { lineRange, topSourceLine, visibleSourceLines } from './sourceLines'

/** A preview 100 px high, with blocks at the given source lines and heights, scrolled by `scroll`. */
function preview(blocks: [line: number, height: number][], scroll = 0): HTMLElement {
  const root = document.createElement('article')
  root.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 }) as DOMRect
  let y = -scroll
  for (const [line, height] of blocks) {
    const el = document.createElement('p')
    el.dataset.sourceLine = String(line)
    const top = y
    el.getBoundingClientRect = () => ({ top, bottom: top + height, height }) as DOMRect
    root.appendChild(el)
    y += height
  }
  return root
}

describe('source lines of the preview', () => {
  it('runs from the first block whose top is in view to the last whose bottom is', () => {
    // blocks at 0–30, 30–60, 60–90, 90–120 px, scrolled by 10: the first one is cut off at the top
    const root = preview(
      [
        [0, 30],
        [2, 30],
        [5, 30],
        [8, 30],
      ],
      10,
    )
    expect(visibleSourceLines(root, 9)).toEqual({ first: 2, last: 7 })
    expect(topSourceLine(root)).toBe(0)
  })

  it('takes the last block up to the end of the text', () => {
    const root = preview([
      [0, 30],
      [4, 30],
    ])
    expect(visibleSourceLines(root, 9)).toEqual({ first: 0, last: 9 })
  })

  it('counts one block taller than the view', () => {
    const root = preview(
      [
        [0, 30],
        [3, 400],
        [20, 30],
      ],
      100,
    )
    expect(visibleSourceLines(root, 25)).toEqual({ first: 3, last: 19 })
  })

  it('has nothing to say while hidden', () => {
    const root = preview([[0, 30]])
    root.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 }) as DOMRect
    expect(visibleSourceLines(root, 0)).toBeNull()
  })

  it('turns lines into the characters the editor would send', () => {
    const text = 'eins\nzwei\ndrei'
    expect(lineRange(text, 1, 1)).toEqual({ top: 5, bottom: 9 })
    expect(lineRange(text, 0, 2)).toEqual({ top: 0, bottom: 14 })
    expect(lineRange(text, 2, 99)).toEqual({ top: 10, bottom: 14 })
  })
})
