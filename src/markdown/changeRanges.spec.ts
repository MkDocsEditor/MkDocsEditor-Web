import { describe, expect, it } from 'vitest'

import { atxHeadings, linesOf, placeRanges, textHash } from './changeRanges'
import type { ChangeRange } from './changeRanges'

const range = (r: Partial<ChangeRange>): ChangeRange => ({
  line: 1,
  count: 1,
  heading: null,
  headingOccurrence: 0,
  offset: 0,
  ...r,
})

describe('change ranges', () => {
  it('counts lines like the backend', () => {
    expect(linesOf('a\nb\n')).toEqual(['a', 'b'])
    expect(linesOf('a\nb')).toEqual(['a', 'b'])
    expect(linesOf('')).toEqual([])
    expect(linesOf('a\r\nb')).toEqual(['a\r', 'b'])
  })

  it('hashes the UTF-8 text without changing it', async () => {
    // printf 'Grüße\r\n' | sha256sum
    expect(await textHash('Grüße\r\n')).toBe('fadad47a2f205c1a')
    expect(await textHash('')).toBe('e3b0c44298fc1c14')
  })

  it('finds ATX headings outside front matter and fences', () => {
    const text = '---\ntitle: x\n# kein\n...\n# Eins #\n```\n# Code\n```\n##   Zwei  \r\n#\n'
    expect(atxHeadings(text)).toEqual([
      { text: 'Eins', line: 5 },
      { text: 'Zwei', line: 9 },
      { text: '', line: 10 },
    ])
  })

  it('takes the lines as they are while the hash matches', () => {
    expect(placeRanges('a\nb\nc\nd\n', [range({ line: 2, count: 2 })], true)).toEqual([
      { from: 2, to: 3 },
    ])
  })

  it('finds a range by its heading and offset in a changed text', () => {
    const text = 'neu\n## A\nx\n## B\n1\n2\n## B\n3\n4\n'
    const ranges = [
      range({ line: 3, count: 1, heading: 'B', headingOccurrence: 2, offset: 1 }),
      range({ line: 1, count: 1, heading: 'B', headingOccurrence: 5, offset: 2 }),
      range({ line: 2, count: 1, heading: 'Fehlt', headingOccurrence: 1, offset: 9 }),
    ]
    expect(placeRanges(text, ranges, false)).toEqual([
      { from: 8, to: 8 },
      // fewer headings with that text: the first one
      { from: 6, to: 6 },
      // no such heading: the line
      { from: 2, to: 2 },
    ])
  })

  it('clamps to the text, and marks removals', () => {
    const text = 'a\nb\n'
    expect(
      placeRanges(text, [range({ line: 9, count: 3 }), range({ line: 3, count: 0 })], true),
    ).toEqual([
      { from: 2, to: 2 },
      { from: 3, to: 3, removal: true },
    ])
    expect(placeRanges('', [range({ line: 1, count: 0 })], true)).toEqual([
      { from: 1, to: 1, removal: true },
    ])
  })
})
