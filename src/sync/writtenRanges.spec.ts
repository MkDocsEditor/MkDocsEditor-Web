import { beforeAll, describe, expect, it } from 'vitest'

import { loadAutomerge } from './automerge'
import type { AmDoc, AutomergeApi } from './automerge'
import { applyChanges } from './session'
import type { TextChange } from './session'
import { MAX_LIVE_CHANGES, insertedRanges, patchesToChanges, writtenRanges } from './writtenRanges'

let A: AutomergeApi
beforeAll(async () => {
  A = await loadAutomerge()
})

const ANNA = 'aa'.repeat(16)
const BEN = 'bb'.repeat(16)

/** The changes from `before` to `doc` as the session sees them. */
function arrived(before: AmDoc, doc: AmDoc) {
  const changes = patchesToChanges(A.diff(doc, A.getHeads(before), A.getHeads(doc)))!
  const newChanges = A.getChanges(before, doc).map((c) => A.decodeChange(c))
  return { changes, newChanges }
}

function textOf(doc: AmDoc, ranges: { from: number; to: number }[]): string[] {
  return ranges.map((r) => doc.content.slice(r.from, r.to))
}

describe('insertedRanges', () => {
  it('places inserts in the text after all changes', () => {
    const changes: TextChange[] = [
      { from: 5, to: 5, insert: 'XX' },
      { from: 0, to: 0, insert: '__' },
      { from: 3, to: 4, insert: '' },
    ]
    const text = applyChanges('abcdefgh', changes)
    expect(text).toBe('__acdeXXfgh')
    expect(insertedRanges(changes).map((r) => text.slice(r.from, r.to))).toEqual(['XX', '__'])
  })

  it('drops text a later change deleted, and keeps a replacement', () => {
    const changes: TextChange[] = [
      { from: 0, to: 0, insert: 'weg' },
      { from: 0, to: 3, insert: '' },
      { from: 0, to: 1, insert: 'Z' },
    ]
    expect(insertedRanges(changes)).toEqual([{ from: 0, to: 1 }])
  })

  it('does not take text inserted at its edges as its own', () => {
    const changes: TextChange[] = [
      { from: 2, to: 2, insert: 'mm' },
      { from: 2, to: 2, insert: '<' },
      { from: 5, to: 5, insert: '>' },
    ]
    expect(insertedRanges(changes)).toEqual([
      { from: 3, to: 5 },
      { from: 2, to: 3 },
      { from: 5, to: 6 },
    ])
  })
})

describe('writtenRanges', () => {
  it('gives the text of one writer to that writer', () => {
    const base = A.from({ content: 'Hallo Welt' }, { actor: ANNA })
    const ben = A.change(A.clone(base, { actor: BEN }), (d) =>
      A.splice(d, ['content'], 5, 0, ', schöne'),
    )
    const doc = A.merge(A.clone(base), ben)
    const { changes, newChanges } = arrived(base, doc)
    const written = writtenRanges(A, doc, newChanges, changes)
    expect(written.map((w) => w.writer)).toEqual([BEN])
    expect(textOf(doc, written)).toEqual([', schöne'])
  })

  it('tells several writers apart when their changes arrive together', () => {
    const base = A.from({ content: 'eins zwei' }, { actor: ANNA })
    const anna = A.change(A.clone(base, { actor: 'cc'.repeat(16) }), (d) =>
      A.splice(d, ['content'], 0, 0, '😀 Anna '),
    )
    const ben = A.change(A.clone(base, { actor: BEN }), (d) =>
      A.splice(d, ['content'], 9, 0, ' Ben'),
    )
    const doc = A.merge(A.merge(A.clone(base), anna), ben)
    const { changes, newChanges } = arrived(base, doc)
    const written = writtenRanges(A, doc, newChanges, changes)
    const byWriter = Object.fromEntries(
      written.map((w) => [w.writer, doc.content.slice(w.from, w.to)]),
    )
    expect(byWriter).toEqual({ ['cc'.repeat(16)]: '😀 Anna ', [BEN]: ' Ben' })
  })

  it('leaves out text a writer inserted and deleted again in the same sync', () => {
    const base = A.from({ content: 'Hallo Welt' }, { actor: ANNA })
    let ben = A.change(A.clone(base, { actor: BEN }), (d) => A.splice(d, ['content'], 5, 0, 'XY'))
    ben = A.change(ben, (d) => A.splice(d, ['content'], 5, 2))
    const cc = A.change(A.clone(base, { actor: 'cc'.repeat(16) }), (d) =>
      A.splice(d, ['content'], 0, 0, 'Z'),
    )
    const doc = A.merge(A.merge(A.clone(base), ben), cc)
    const { changes, newChanges } = arrived(base, doc)
    const written = writtenRanges(A, doc, newChanges, changes)
    // never the old space between the words
    expect(written.map((w) => [w.writer, doc.content.slice(w.from, w.to)])).toEqual([
      ['cc'.repeat(16), 'Z'],
    ])
  })

  it('marks nothing for a catch-up of many changes', () => {
    const base = A.from({ content: '' }, { actor: ANNA })
    let ben = A.clone(base, { actor: BEN })
    for (let i = 0; i <= MAX_LIVE_CHANGES; i++)
      ben = A.change(ben, (d) => A.splice(d, ['content'], i, 0, 'x'))
    const doc = A.merge(A.clone(base), ben)
    const { changes, newChanges } = arrived(base, doc)
    expect(writtenRanges(A, doc, newChanges, changes)).toEqual([])
  })
})
