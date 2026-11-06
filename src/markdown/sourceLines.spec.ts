import { describe, expect, it } from 'vitest'

import {
  lineRange,
  previewAnchor,
  previewScrollTop,
  scrollProgress,
  visibleSourceLines,
} from './sourceLines'

/** A preview 100 px high, with blocks at the given source lines and heights, scrolled by `scroll`. */
function preview(blocks: [line: number, height: number][], scroll = 0): HTMLElement {
  const root = document.createElement('article')
  root.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 }) as DOMRect
  const content = blocks.reduce((sum, [, height]) => sum + height, 0)
  Object.defineProperties(root, {
    scrollTop: { value: scroll },
    clientHeight: { value: 100 },
    scrollHeight: { value: Math.max(100, content) },
  })
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

  it('reads at the height of the scroll progress, so both ends line up', () => {
    // 10 blocks of 2 lines and 50 px each: 500 px of content, 400 px of scrolling
    const blocks = Array.from({ length: 10 }, (_, i) => [i * 2, 50] as [number, number])
    expect(previewAnchor(preview(blocks, 0), 19)).toEqual({ line: 0, at: 0 })
    expect(previewAnchor(preview(blocks, 400), 19)).toEqual({ line: 20, at: 1 })
    // halfway: the reading line is in the middle of the view, at 200 + 50 px
    expect(previewAnchor(preview(blocks, 200), 19)).toEqual({ line: 10, at: 0.5 })
    // a quarter into the block of lines 2 and 3
    expect(previewAnchor(preview(blocks, 50), 19)!.line).toBeCloseTo(2.5)
  })

  it('places a source position at the height the other pane has it', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => [i * 2, 50] as [number, number])
    const root = preview(blocks)
    expect(previewScrollTop(root, 19, { line: 10, at: 0.5 })).toBe(200)
    expect(previewScrollTop(root, 19, { line: 3, at: 0 })).toBe(75)
    // clamped at both ends
    expect(previewScrollTop(root, 19, { line: 0.5, at: 0.5 })).toBe(0)
    expect(previewScrollTop(root, 19, { line: 20, at: 0 })).toBe(400)
    // and the way back gives the same place
    const there = preview(blocks, 200)
    expect(previewAnchor(there, 19)).toEqual({ line: 10, at: 0.5 })
  })

  it('skips blocks inside blocks, and starts before the first block', () => {
    // a list on line 4 whose first item starts on the same line
    const root = preview([
      [4, 50],
      [4, 0],
      [8, 50],
    ])
    expect(previewScrollTop(root, 9, { line: 2, at: 0 })).toBe(0)
    expect(previewScrollTop(root, 9, { line: 6, at: 0 })).toBe(0)
    expect(
      previewScrollTop(
        preview([
          [0, 50],
          [4, 50],
          [8, 300],
        ]),
        9,
        { line: 6, at: 0 },
      ),
    ).toBe(75)
  })

  it('counts a pane that cannot scroll as at its start', () => {
    const root = preview([[0, 30]])
    expect(scrollProgress(root)).toBe(0)
  })

  it('turns lines into the characters the editor would send', () => {
    const text = 'eins\nzwei\ndrei'
    expect(lineRange(text, 1, 1)).toEqual({ top: 5, bottom: 9 })
    expect(lineRange(text, 0, 2)).toEqual({ top: 0, bottom: 14 })
    expect(lineRange(text, 2, 99)).toEqual({ top: 10, bottom: 14 })
  })
})
