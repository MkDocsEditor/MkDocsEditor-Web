import { EditorState } from '@codemirror/state'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorView } from '@codemirror/view'

import {
  animateText,
  appearance,
  appearingRanges,
  finishAnimation,
  finishReveal,
  hiddenRanges,
  revealHeads,
  revealText,
  revealsText,
} from './appearance'
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

describe('typing reveal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function editor(doc: string, config: Partial<AppearanceConfig> = { enabled: true }) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    return new EditorView({
      state: EditorState.create({ doc, extensions: appearance(config) }),
      parent: document.body,
    })
  }

  /** An agent's live change inserts `text` at `at`, to be typed out. */
  function agentWrites(view: EditorView, at: number, text: string, tag = 'agent') {
    view.dispatch({
      changes: { from: at, insert: text },
      effects: revealText.of([{ tag, from: at, to: at + text.length }]),
    })
  }

  it('hides the text in the transaction that inserts it, then types it out', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt, wie geht es?')
    expect(view.state.doc.toString()).toBe('Hallo Welt, wie geht es?')
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'agent', from: 6, to: 24 }])
    expect(revealHeads(view.state)).toEqual(new Map([['agent', 6]]))

    vi.advanceTimersByTime(100)
    const [range] = hiddenRanges(view.state)
    expect(range!.from).toBeGreaterThan(6)
    // what is uncovered fades in
    expect(appearingRanges(view.state).at(-1)).toMatchObject({ tag: 'agent', to: range!.from })

    vi.advanceTimersByTime(5_000)
    expect(hiddenRanges(view.state)).toEqual([])
    expect(revealHeads(view.state).size).toBe(0)
    view.destroy()
  })

  it('types the ranges of one change in their order', () => {
    const view = editor('a b')
    view.dispatch({
      changes: [
        { from: 1, insert: 'XX' },
        { from: 3, insert: 'YY' },
      ],
      effects: revealText.of([
        { tag: 'agent', from: 1, to: 3 },
        { tag: 'agent', from: 4, to: 6 },
      ]),
    })
    vi.advanceTimersByTime(40)
    expect(hiddenRanges(view.state)).toEqual([
      { tag: 'agent', from: 2, to: 3 },
      { tag: 'agent', from: 4, to: 6 },
    ])
    view.destroy()
  })

  it('finishes a range when someone edits inside it or at its edge', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt')
    view.dispatch({ changes: { from: 10, insert: '!' } })
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('does not finish it for edits elsewhere', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt')
    view.dispatch({ changes: { from: 0, insert: 'Oh, ' } })
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'agent', from: 10, to: 14 }])
    view.destroy()
  })

  it('finishes the running reveal of an agent when its next change comes', () => {
    const view = editor('')
    agentWrites(view, 0, 'eins ')
    agentWrites(view, 5, 'zwei')
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'agent', from: 5, to: 9 }])
    // another agent's reveal runs at the same time
    agentWrites(view, 0, 'drei ', 'other')
    expect(
      hiddenRanges(view.state)
        .map((r) => r.tag)
        .sort(),
    ).toEqual(['agent', 'other'])
    view.dispatch({ effects: finishReveal.of('agent') })
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'other', from: 0, to: 5 }])
    view.destroy()
  })

  it('shows the text at once when the setting is off or motion is reduced', () => {
    let view = editor('', { enabled: false })
    agentWrites(view, 0, 'Text')
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addListener: () => undefined,
      removeListener: () => undefined,
    }))
    view = editor('')
    expect(revealsText(view.state, 10)).toBe(false)
    agentWrites(view, 0, 'Text')
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('shows the rest at once when the system starts to reduce motion', () => {
    const view = editor('')
    agentWrites(view, 0, 'Text')
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addListener: () => undefined,
      removeListener: () => undefined,
    }))
    vi.advanceTimersByTime(30)
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('does not type out long text', () => {
    const view = editor('', { enabled: true, revealMaxChars: 100 })
    expect(revealsText(view.state, 100)).toBe(true)
    expect(revealsText(view.state, 101)).toBe(false)
    view.destroy()
  })
})
