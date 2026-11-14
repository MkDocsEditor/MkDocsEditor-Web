import { describe, expect, it } from 'vitest'

import {
  diffStats,
  hunksOfUnifiedDiff,
  linesBetween,
  parseUnifiedDiff,
  rangeOfHunk,
  showHunk,
  wordDiff,
} from './diff'
import type { DiffHunk } from './diff'

const DIFF = `diff --git a/docs/a.md b/docs/a.md
index 1111111..2222222 100644
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,3 +1,3 @@ Rezept
 # Rezept
-Version eins
+Version zwei
 Ende
\\ No newline at end of file
`

describe('parseUnifiedDiff', () => {
  it('turns a unified diff into numbered lines without headers', () => {
    const lines = parseUnifiedDiff(DIFF)
    expect(lines).toEqual([
      { kind: 'hunk', text: 'Rezept', oldLine: 1, newLine: 1 },
      { kind: 'context', text: '# Rezept', oldLine: 1, newLine: 1 },
      { kind: 'del', text: 'Version eins', oldLine: 2 },
      { kind: 'add', text: 'Version zwei', newLine: 2 },
      { kind: 'context', text: 'Ende', oldLine: 3, newLine: 3 },
    ])
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 })
  })

  it('returns nothing for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('structured diffs', () => {
  const hunk = (lines: DiffHunk['lines'], extra: Partial<DiffHunk> = {}): DiffHunk => ({
    heading: 'Setup',
    headingOccurrence: 1,
    offset: 0,
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 0,
    lines,
    ...extra,
  })

  it('marks the changed words of a pair of lines', () => {
    expect(wordDiff('Then reboot.', 'Then reboot twice.')).toEqual({
      before: [{ text: 'Then reboot.', changed: false }],
      after: [
        { text: 'Then reboot', changed: false },
        { text: ' twice', changed: true },
        { text: '.', changed: false },
      ],
    })
    expect(wordDiff('a'.repeat(1), 'b '.repeat(30_000))).toBeUndefined()
  })

  it('pairs removed with added lines and numbers them', () => {
    const lines = showHunk(
      hunk(
        [
          { op: ' ', text: '# Setup' },
          { op: '-', text: 'Some text.' },
          { op: '-', text: 'Gone.' },
          { op: '+', text: 'Some better text.' },
          { op: '+', text: 'Totally new' },
        ],
        { oldStart: 4, newStart: 4 },
      ),
    )
    expect(lines.map((l) => [l.op, l.oldLine, l.newLine])).toEqual([
      [' ', 4, 4],
      ['-', 5, undefined],
      ['-', 6, undefined],
      ['+', undefined, 5],
      ['+', undefined, 6],
    ])
    expect(lines[1]!.pieces?.filter((p) => p.changed)).toEqual([])
    expect(lines[3]!.pieces?.filter((p) => p.changed).map((p) => p.text)).toEqual(['better '])
    // "Gone." and "Totally new" share nothing: whole lines, no pieces
    expect(lines[2]!.pieces).toBeUndefined()
    expect(lines[4]!.pieces).toBeUndefined()
  })

  it('finds a hunk again by its heading, from its first changed line', () => {
    const added = hunk(
      [
        { op: ' ', text: 'a' },
        { op: ' ', text: 'b' },
        { op: '+', text: 'new' },
        { op: ' ', text: 'c' },
      ],
      { newStart: 10, offset: -1 },
    )
    expect(rangeOfHunk(added)).toEqual({
      line: 12,
      count: 1,
      heading: 'Setup',
      headingOccurrence: 1,
      offset: 1,
    })
    const removed = hunk(
      [
        { op: ' ', text: 'a' },
        { op: '-', text: 'old' },
      ],
      { newStart: 3, offset: 2 },
    )
    expect(rangeOfHunk(removed)).toMatchObject({ line: 4, count: 0, offset: 3 })
  })

  it('reads hunks from a unified diff of older backends, and folds what is between', () => {
    const hunks = hunksOfUnifiedDiff('@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -20 +20 @@\n-x\n+y\n')
    expect(hunks).toHaveLength(2)
    expect(hunks[0]).toMatchObject({
      heading: null,
      oldStart: 1,
      newStart: 1,
      oldLines: 2,
      newLines: 2,
    })
    expect(hunks[1]).toMatchObject({ newStart: 20, offset: 19 })
    expect(linesBetween(hunks[0]!, hunks[1]!)).toBe(17)
  })
})
