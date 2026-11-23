import { EditorState } from '@codemirror/state'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { animateText, appearance, appearingRanges, finishAnimation } from './appearance'
import type { AppearanceConfig } from './appearance'

function state(doc: string, config: Partial<AppearanceConfig> = { enabled: true }) {
  return EditorState.create({ doc, extensions: appearance(config) })
}

/** Another writer inserts `text` at `at`, marked to fade. */
function written(s: EditorState, tag: string, at: number, text: string): EditorState {
  return s.update({
    changes: { from: at, insert: text },
    effects: animateText.of([{ tag, from: at, to: at + text.length }]),
  }).state
}

describe('appearance', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fades the text that others insert and follows later edits', () => {
    let s = written(state('Hallo'), 'ben', 5, ' Welt')
    expect(appearingRanges(s)).toEqual([{ tag: 'ben', from: 5, to: 10 }])
    // the person types in front of it: the range moves, and nothing they type fades
    s = s.update({ changes: { from: 0, insert: 'Oh, ' } }).state
    expect(appearingRanges(s)).toEqual([{ tag: 'ben', from: 9, to: 14 }])
  })

  it('never fades what the person types into text that still fades', () => {
    let s = written(state('Hallo'), 'ben', 5, ' Welt')
    s = s.update({ changes: { from: 7, insert: 'x' } }).state
    expect(appearingRanges(s)).toEqual([
      { tag: 'ben', from: 5, to: 7 },
      { tag: 'ben', from: 8, to: 11 },
    ])
  })

  it('is off by default', () => {
    const s = written(state('Hallo', {}), 'ben', 5, ' Welt')
    expect(appearingRanges(s)).toEqual([])
  })

  it('fades only the newest characters of a writer', () => {
    let s = written(state(''), 'ben', 0, 'x'.repeat(40))
    expect(appearingRanges(s)).toEqual([{ tag: 'ben', from: 24, to: 40 }])
    s = written(s, 'ben', 40, 'y'.repeat(10))
    expect(appearingRanges(s)).toEqual([
      { tag: 'ben', from: 34, to: 40 },
      { tag: 'ben', from: 40, to: 50 },
    ])
    // another writer has a window of their own
    s = written(s, 'anna', 0, 'a')
    expect(appearingRanges(s)).toHaveLength(3)
  })

  it('fades at most maxRanges ranges, the newest', () => {
    let s = state('', { enabled: true, maxRanges: 3 })
    for (const tag of ['a', 'b', 'c', 'd']) s = written(s, tag, s.doc.length, tag)
    expect(appearingRanges(s).map((r) => r.tag)).toEqual(['b', 'c', 'd'])
  })

  it('finishes the fades of one writer and leaves the others', () => {
    let s = written(written(state(''), 'ben', 0, 'Ben'), 'agent', 3, 'Agent')
    s = s.update({ effects: finishAnimation.of('agent') }).state
    expect(appearingRanges(s)).toEqual([{ tag: 'ben', from: 0, to: 3 }])
  })

  it('fades nothing when the system reduces motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    expect(appearingRanges(written(state('Hallo'), 'ben', 5, ' Welt'))).toEqual([])
  })
})
