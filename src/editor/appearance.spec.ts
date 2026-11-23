import { EditorState } from '@codemirror/state'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorView } from '@codemirror/view'

import {
  animateText,
  appearance,
  appearingRanges,
  finishAnimation,
  finishReveal,
  GROW_MS,
  growingRanges,
  growsUpTo,
  growthsForTests,
  hiddenRanges,
  remoteChange,
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

/** The growths of a state, without ids and times. */
function growths(s: EditorState) {
  return growthsForTests(s).map(({ from, to, duration, linear, spacing }) => ({
    from,
    to,
    duration,
    linear,
    spacing,
  }))
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
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    })
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

  /** Somebody else (not an agent with a reveal) changes the text. */
  function otherWrites(view: EditorView, from: number, to: number, insert = '') {
    view.dispatch({ changes: { from, to, insert }, annotations: remoteChange.of(true) })
  }

  it('shows all hidden text of the person here changes the text, anywhere', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt')
    agentWrites(view, 0, 'Oh ', 'other')
    view.dispatch({ changes: { from: 0, insert: '!' } })
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('shows the hidden text of a writer that somebody else changes, inside or at an edge', () => {
    for (const [from, to] of [
      [7, 8],
      [6, 6],
      [10, 10],
    ] as const) {
      const view = editor('Hallo ')
      agentWrites(view, 6, 'Welt')
      agentWrites(view, 0, 'Oh ', 'other')
      // positions after "Oh " went in front
      otherWrites(view, from + 3, to + 3, 'x')
      expect(hiddenRanges(view.state)).toEqual([{ tag: 'other', from: 0, to: 3 }])
      view.destroy()
    }
  })

  it('judges each change of a live change on its own: a replace in hidden text shows it', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt')
    // the agent replaces a hidden character: not an insert, so not its own
    view.dispatch({
      changes: { from: 7, to: 8, insert: 'E' },
      effects: revealText.of([{ tag: 'agent', from: 7, to: 8 }]),
      annotations: remoteChange.of(true),
    })
    // all of it shows: the rest of "Welt", and the new text of the replace, which fades in
    expect(hiddenRanges(view.state)).toEqual([])
    expect(appearingRanges(view.state)).toContainEqual({ tag: 'agent', from: 7, to: 8 })
    view.destroy()

    // a chunk at the end plus a delete inside, in one transaction: the delete shows it
    const other = editor('Hallo ')
    agentWrites(other, 6, 'Welt')
    other.dispatch({
      changes: [
        { from: 7, to: 8 },
        { from: 10, insert: ' heute' },
      ],
      effects: revealText.of([{ tag: 'agent', from: 9, to: 15 }]),
      annotations: remoteChange.of(true),
    })
    expect(hiddenRanges(other.state)).toEqual([{ tag: 'agent', from: 9, to: 15 }])
    other.destroy()
  })

  it('moves hidden text with changes of others elsewhere', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt')
    otherWrites(view, 0, 0, 'Oh, ')
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'agent', from: 10, to: 14 }])
    view.destroy()
  })

  it('queues the chunks of an agent and never shows hidden text early', () => {
    const view = editor('a b')
    agentWrites(view, 1, ' eins')
    // right at the end of the newest chunk: joins it
    agentWrites(view, 6, ' zwei')
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'agent', from: 1, to: 11 }])
    // elsewhere, and right at the start of hidden text: new entries at the end of the queue
    agentWrites(view, 13, ' drei')
    agentWrites(view, 1, 'vier')
    expect(hiddenRanges(view.state)).toEqual([
      { tag: 'agent', from: 5, to: 15 },
      { tag: 'agent', from: 17, to: 22 },
      { tag: 'agent', from: 1, to: 5 },
    ])
    // inside hidden text: part of it
    agentWrites(view, 7, 'X')
    expect(hiddenRanges(view.state)[0]).toEqual({ tag: 'agent', from: 5, to: 16 })
    // the head walks the queue in its order
    expect(revealHeads(view.state).get('agent')).toBe(5)
    vi.advanceTimersByTime(100)
    expect(revealHeads(view.state).get('agent')).toBeGreaterThan(5)
    vi.advanceTimersByTime(4_000)
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('shows the reveal of one agent at once and leaves the others', () => {
    const view = editor('')
    agentWrites(view, 0, 'eins ')
    agentWrites(view, 0, 'drei ', 'other')
    view.dispatch({ effects: finishReveal.of('agent') })
    expect(hiddenRanges(view.state)).toEqual([{ tag: 'other', from: 0, to: 5 }])
    view.destroy()
  })

  it('reveals at 60 characters a second, faster for a backlog, and never slower', () => {
    const view = editor('')
    agentWrites(view, 0, 'x'.repeat(30))
    vi.advanceTimersByTime(250)
    // about 15 of 30
    const left = hiddenRanges(view.state)[0]!
    expect(left.to - left.from).toBeGreaterThanOrEqual(13)
    expect(left.to - left.from).toBeLessThanOrEqual(17)
    vi.advanceTimersByTime(1_000)
    expect(hiddenRanges(view.state)).toEqual([])

    // 2,000 characters at once: within 4 s, at an even speed
    agentWrites(view, 30, 'y'.repeat(2_000))
    const shown: number[] = []
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(500)
      const [range] = hiddenRanges(view.state)
      shown.push(2_000 - (range ? range.to - range.from : 0))
    }
    expect(shown.at(-1)).toBe(2_000)
    const steps = shown.slice(0, 7).map((n, i) => n - (shown[i - 1] ?? 0))
    for (const step of steps) expect(Math.abs(step - 250)).toBeLessThanOrEqual(10)
    view.destroy()
  })

  it('keeps the speed when a small chunk comes while a big one is revealed', () => {
    const view = editor('')
    agentWrites(view, 0, 'x'.repeat(1_000))
    vi.advanceTimersByTime(2_000)
    agentWrites(view, 1_000, 'y'.repeat(10))
    // all that was hidden when the chunk came shows within 4 s
    vi.advanceTimersByTime(2_100)
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('lets every piece of a reveal fade in full, also past the window of fades', () => {
    const view = editor('', { enabled: true, revealCharsPerSecond: 600 })
    agentWrites(view, 0, 'x'.repeat(100))
    vi.advanceTimersByTime(100)
    const fading = appearingRanges(view.state).reduce((sum, r) => sum + r.to - r.from, 0)
    expect(fading).toBeGreaterThan(16)
    // a new chunk ends none of them; a change of the person here ends them all
    agentWrites(view, 100, 'y')
    expect(appearingRanges(view.state).length).toBeGreaterThan(0)
    view.dispatch({ changes: { from: 0, insert: '!' } })
    expect(appearingRanges(view.state)).toEqual([])
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
    vi.advanceTimersByTime(50)
    expect(hiddenRanges(view.state)).toEqual([])
    view.destroy()
  })

  it('does not type out long text', () => {
    const view = editor('', { enabled: true, revealMaxChars: 100 })
    expect(revealsText(view.state, 100)).toBe(true)
    expect(revealsText(view.state, 101)).toBe(false)
    view.destroy()
  })

  it('grows the space of every remote insert, and of every agent change', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = written(state('Hallo'), 'ben', 5, ' Welt')
    expect(growingRanges(s)).toEqual([{ from: 5, to: 10 }])
    expect(growsUpTo(s, 10)).toBe(true)
    // a live agent change grows however short
    s = s.update({
      changes: { from: 0, insert: 'Oh' },
      effects: revealText.of([{ tag: 'agent', from: 0, to: 2 }]),
    }).state
    expect(growingRanges(s)).toEqual([
      { from: 7, to: 12 },
      { from: 0, to: 2 },
    ])
    vi.advanceTimersByTime(GROW_MS)
    expect(growsUpTo(s, 12)).toBe(false)
    vi.useRealTimers()
  })

  it('grows typed text evenly and takes the growth under way along', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = written(state('Hallo'), 'ben', 5, '!')
    expect(growths(s)).toEqual([{ from: 5, to: 6, duration: GROW_MS, linear: false, spacing: -1 }])
    // the next key 100 ms later, right behind: even, for those 100 ms, the one before along
    vi.advanceTimersByTime(100)
    s = written(s, 'ben', 6, '?')
    const [first, second] = growths(s)
    expect(second).toEqual({ from: 6, to: 7, duration: 100, linear: true, spacing: -1 })
    // the first stopped where it was: about 1 - (1 - 100/120)³ of it was there
    expect(first).toMatchObject({ duration: 100, linear: true })
    expect(first!.spacing).toBeCloseTo(-((1 - 100 / 120) ** 3))
    // more than 3 characters, not right behind, or 250 ms later: the ease-out
    vi.advanceTimersByTime(300)
    s = written(s, 'ben', 7, 'x')
    expect(growths(s).at(-1)).toMatchObject({ duration: GROW_MS, linear: false })
    vi.advanceTimersByTime(50)
    s = written(s, 'ben', 8, 'long')
    expect(growths(s).at(-1)).toMatchObject({ duration: GROW_MS, linear: false })
    vi.advanceTimersByTime(50)
    s = written(s, 'ben', 0, 'y')
    expect(growths(s).at(-1)).toMatchObject({ duration: GROW_MS, linear: false })
    vi.useRealTimers()
  })

  it('grows nothing typed here, nor with the setting off or reduced motion', () => {
    expect(
      growingRanges(state('Hallo').update({ changes: { from: 0, insert: 'Lokal ' } }).state),
    ).toEqual([])
    expect(growingRanges(written(state('Hallo', {}), 'ben', 5, ' Welt'))).toEqual([])
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }))
    expect(growingRanges(written(state('Hallo'), 'ben', 5, ' Welt'))).toEqual([])
  })

  it('animates the space of the inserted text in the editor', async () => {
    const animate = vi.fn(() => ({ startTime: 0 }) as unknown as Animation)
    HTMLElement.prototype.animate = animate
    const view = new EditorView({ state: state('Hallo'), parent: document.body })
    view.dispatch({
      changes: { from: 5, insert: ' Welt' },
      effects: animateText.of([{ tag: 'ben', from: 5, to: 10 }]),
    })
    // on CodeMirror's next measure
    await vi.waitFor(() =>
      expect(animate).toHaveBeenCalledWith(
        [{ letterSpacing: '-1ch' }, { letterSpacing: '0ch' }],
        expect.objectContaining({ duration: 120 }),
      ),
    )
    view.destroy()
  })
})
