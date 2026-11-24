import { EditorState } from '@codemirror/state'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorView } from '@codemirror/view'

import {
  animateText,
  appearance,
  appearingRanges,
  appearingSpans,
  finishAnimation,
  FADE_MAX_MS,
  FADE_MIN_MS,
  fadeDuration,
  finishReveal,
  forgetRevealEnd,
  revealEnds,
  GROW_MS,
  growingRanges,
  growsUpTo,
  growthsForTests,
  hiddenRanges,
  pieceAlpha,
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
  return growthsForTests(s).map(({ from, to, duration, crisp, spacing }) => ({
    from,
    to,
    duration,
    crisp,
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

  it('fades all of the text, however long, and each piece with its own start', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = written(state(''), 'ben', 0, 'x'.repeat(400))
    expect(appearingRanges(s)).toEqual([{ tag: 'ben', from: 0, to: 400 }])
    vi.advanceTimersByTime(16)
    s = written(s, 'ben', 400, 'y')
    expect(appearingRanges(s)).toHaveLength(2)
    vi.useRealTimers()
  })

  it('fades in with the ease-out quadratic over 500 ms', () => {
    expect(pieceAlpha(0, 0, 500)).toBe(0)
    expect(pieceAlpha(0, 250, 500)).toBeCloseTo(0.75)
    expect(pieceAlpha(0, 500, 500)).toBe(1)
    // never more than 0.1 from one frame to the next
    for (let t = 0; t < 500; t += 16)
      expect(pieceAlpha(0, t + 16, 500) - pieceAlpha(0, t, 500)).toBeLessThan(0.1)
  })

  it('fades the text of a slow writer shortly and of a fast one longer', () => {
    expect(fadeDuration(0)).toBe(FADE_MIN_MS)
    expect(fadeDuration(10)).toBe(FADE_MIN_MS)
    expect(fadeDuration(65)).toBeCloseTo(660)
    expect(fadeDuration(120)).toBe(FADE_MAX_MS)
    expect(fadeDuration(5_000)).toBe(FADE_MAX_MS)
  })

  it('takes the rate of a writer from its characters, forgetting within a second', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    const duration = (s: EditorState, at: number) =>
      appearingSpans(s).find((r) => r.from === at)!.duration
    // a person: one character every 150 ms stays slow
    let s = state('')
    for (let i = 0; i < 10; i++) {
      s = written(s, 'ben', i, 'x')
      vi.advanceTimersByTime(150)
    }
    expect(duration(s, 9)).toBe(FADE_MIN_MS)
    // an agent: 200 characters at once is fast
    s = written(s, 'agent', 10, 'y'.repeat(200))
    expect(duration(s, 10)).toBe(FADE_MAX_MS)
    // two seconds later it has forgotten most of it: e^-2 of 200 is 27
    vi.advanceTimersByTime(2_000)
    s = written(s, 'agent', 210, 'z')
    expect(duration(s, 210)).toBeCloseTo(fadeDuration(200 * Math.exp(-2) + 1), 0)
    vi.useRealTimers()
  })

  it('merges the closest pieces one behind the other of a writer past maxRanges', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = state('', { enabled: true, maxRanges: 3 })
    // a, then b and c at the same time, right behind: b and c are the closest
    s = written(s, 'ben', 0, 'a')
    vi.advanceTimersByTime(100)
    s = written(s, 'ben', 1, 'b')
    s = written(s, 'ben', 2, 'c')
    vi.advanceTimersByTime(100)
    s = written(s, 'ben', 3, 'd')
    expect(appearingRanges(s)).toEqual([
      { tag: 'ben', from: 0, to: 1 },
      { tag: 'ben', from: 3, to: 4 },
      { tag: 'ben', from: 1, to: 3 },
    ])
    // no neighbours of a writer: the most visible shows at once
    let t = state('', { enabled: true, maxRanges: 2 })
    for (const tag of ['a', 'b', 'c']) {
      t = written(t, tag, t.doc.length, tag)
      vi.advanceTimersByTime(50)
    }
    expect(appearingRanges(t).map((r) => r.tag)).toEqual(['b', 'c'])
    vi.useRealTimers()
  })

  it('finishes the fades of one writer and leaves the others', () => {
    let s = written(written(state(''), 'ben', 0, 'Benny'), 'agent', 5, 'Agent')
    s = s.update({ effects: finishAnimation.of('agent') }).state
    expect(appearingRanges(s)).toEqual([{ tag: 'ben', from: 0, to: 5 }])
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

  it('shows the reveal a cursor or selection of the person here goes into, not one at its edge (R1)', () => {
    const reveal = () => {
      const view = editor('Hallo ')
      agentWrites(view, 6, 'Welt, wie geht es?')
      agentWrites(view, 0, 'Oh ', 'other')
      vi.advanceTimersByTime(50)
      return view
    }
    // positions after "Oh "; the agent's text is 9 to 27
    for (const [anchor, head, shows] of [
      [9, 9, false],
      [27, 27, false],
      [5, 9, false],
      [10, 10, true],
      [20, 20, true],
      [5, 12, true],
      [25, 27, true],
    ] as const) {
      const view = reveal()
      const head0 = revealHeads(view.state).get('agent')
      view.dispatch({ selection: { anchor, head } })
      // the other writer goes on either way
      expect({
        at: [anchor, head],
        hidden: hiddenRanges(view.state).map((r) => r.tag),
        appearing: appearingRanges(view.state).some((r) => r.tag === 'agent'),
        head: revealHeads(view.state).get('agent'),
      }).toEqual({
        at: [anchor, head],
        hidden: shows ? ['other'] : ['agent', 'other'],
        appearing: !shows,
        head: shows ? undefined : head0,
      })
      view.destroy()
    }
  })

  it('shows nothing for a cursor that only moves with the text', () => {
    const view = editor('Hallo ')
    view.dispatch({ selection: { anchor: 6 } })
    agentWrites(view, 6, 'Welt')
    agentWrites(view, 0, 'Oh ', 'other')
    expect(view.state.selection.main.head).toBe(9)
    expect(
      hiddenRanges(view.state)
        .map((r) => r.tag)
        .sort(),
    ).toEqual(['agent', 'other'])
    view.destroy()
  })

  it('remembers where the text revealed last ends, as it is typed out or shown at once (R2)', () => {
    const view = editor('Hallo ')
    agentWrites(view, 6, 'Welt')
    vi.advanceTimersByTime(50)
    expect(revealEnds(view.state).get('agent')).toBe(10)
    vi.advanceTimersByTime(5_000)
    expect(revealHeads(view.state).size).toBe(0)
    expect(revealEnds(view.state).get('agent')).toBe(10)
    // moves with the text, and stays in front of the next chunk
    otherWrites(view, 0, 0, '¡')
    expect(revealEnds(view.state).get('agent')).toBe(11)
    agentWrites(view, 11, ', du')
    vi.advanceTimersByTime(5_000)
    expect(revealEnds(view.state).get('agent')).toBe(15)
    view.dispatch({ changes: { from: 0, insert: '!' } })
    expect(revealEnds(view.state).get('agent')).toBe(16)
    view.dispatch({ effects: forgetRevealEnd.of('agent') })
    expect(revealEnds(view.state).size).toBe(0)
    view.destroy()
  })

  it('splits what a step reveals where a word starts, so a word can be carried (R8)', () => {
    const view = editor('')
    // a backlog: several characters a step
    agentWrites(view, 0, 'ab cd  ef '.repeat(200))
    vi.advanceTimersByTime(200)
    const pieces = appearingRanges(view.state).map((r) => view.state.sliceDoc(r.from, r.to))
    expect(pieces.join('')).toBe(view.state.sliceDoc(0, revealHeads(view.state).get('agent')))
    expect(Math.max(...pieces.map((p) => p.length))).toBeGreaterThan(2)
    // no piece has a word start after a space inside it
    expect(pieces.filter((p) => /\s\S/.test(p))).toEqual([])
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
    // and a while after, for a late frame: 250 ms
    vi.advanceTimersByTime(GROW_MS + 200)
    expect(growsUpTo(s, 12)).toBe(true)
    vi.advanceTimersByTime(50)
    expect(growsUpTo(s, 12)).toBe(false)
    vi.useRealTimers()
  })

  it('grows typed text evenly and takes the growth under way along', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = written(state('Hallo'), 'ben', 5, '!')
    expect(growths(s)).toEqual([{ from: 5, to: 6, duration: GROW_MS, crisp: 1, spacing: -1 }])
    // the next key 100 ms later, right behind: even, for 1.5 × 100 ms, the one before along
    vi.advanceTimersByTime(100)
    s = written(s, 'ben', 6, '?')
    const [first, second] = growths(s)
    expect(second).toEqual({ from: 6, to: 7, duration: 150, crisp: 0, spacing: -1 })
    // the first stopped where it was: about 1 - (1 - 100/120)³ of it was there
    expect(first).toMatchObject({ duration: 150, crisp: 0 })
    // a frame early
    expect(growthsForTests(s).at(-1)!.start).toBe(performance.now() - 16)
    // the next 50 ms later: the time between smoothed, 100 + 0.3 × (50 - 100)
    vi.advanceTimersByTime(50)
    s = written(s, 'ben', 7, '.')
    expect(growths(s).at(-1)).toMatchObject({ duration: 1.5 * 85, crisp: 0 })
    expect(first!.spacing).toBeCloseTo(-((1 - 100 / 120) ** 3))
    // more than 3 characters, not right behind, or 250 ms later: the ease-out
    vi.advanceTimersByTime(300)
    s = written(s, 'ben', 8, 'x')
    expect(growths(s).at(-1)).toMatchObject({ duration: GROW_MS, crisp: 1 })
    vi.advanceTimersByTime(50)
    s = written(s, 'ben', 9, 'long')
    expect(growths(s).at(-1)).toMatchObject({ duration: GROW_MS, crisp: 1 })
    vi.advanceTimersByTime(50)
    s = written(s, 'ben', 0, 'y')
    expect(growths(s).at(-1)).toMatchObject({ duration: GROW_MS, crisp: 1 })
    vi.useRealTimers()
  })

  it('grows slowly typed text in short ease-out steps (R5c)', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = written(state('Hallo'), 'ben', 5, '!')
    // 240 ms later: 100 ms of the ease-out, from now
    vi.advanceTimersByTime(240)
    s = written(s, 'ben', 6, '?')
    expect(growths(s).at(-1)).toEqual({ from: 6, to: 7, duration: 100, crisp: 1, spacing: -1 })
    expect(growthsForTests(s).at(-1)!.start).toBe(performance.now())
    vi.useRealTimers()
  })

  it('closes the gap of text that others remove, and of no removal here', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    const removed = (s: EditorState, from: number, to: number, insert = '') =>
      s.update({ changes: { from, to, insert }, annotations: remoteChange.of(true) }).state
    let s = removed(state('Hallo Welt'), 5, 10)
    expect(growths(s)).toEqual([{ from: 5, to: 5, duration: GROW_MS, crisp: 1, spacing: 5 }])
    expect(growsUpTo(s, 5)).toBe(true)
    // across lines, too long, or here: at once
    expect(growths(removed(state('a\nb'), 0, 3))).toEqual([])
    expect(growths(removed(state('x'.repeat(100)), 0, 100))).toEqual([])
    expect(growths(state('Hallo').update({ changes: { from: 0, to: 5 } }).state)).toEqual([])
    // a replace: the gap of the old text, then the new one
    s = removed(state('Hallo Welt'), 6, 10, 'Ben')
    expect(growths(s)).toEqual([{ from: 6, to: 6, duration: GROW_MS, crisp: 1, spacing: 4 }])
    vi.useRealTimers()
  })

  it('closes a backspace evenly, as typing backwards, and types on after it', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    let s = written(state('Hallo'), 'ben', 5, 'x')
    vi.advanceTimersByTime(100)
    // ben's backspace: the key he typed last, 100 ms later
    s = s.update({ changes: { from: 5, to: 6 }, annotations: remoteChange.of(true) }).state
    expect(growths(s)).toEqual([{ from: 5, to: 5, duration: 150, crisp: 0, spacing: 1 }])
    // a frame early
    expect(growthsForTests(s)[0]!.start).toBe(performance.now() - 16)
    // the right key there 100 ms later: typing on, the gap along
    vi.advanceTimersByTime(100)
    s = written(s, 'ben', 5, 'y')
    const [gap, key] = growths(s)
    expect(key).toEqual({ from: 5, to: 6, duration: 150, crisp: 0, spacing: -1 })
    expect(gap).toMatchObject({ from: 5, to: 5, duration: 150, crisp: 0 })
    // it had closed 100 of 150 ms
    expect(gap!.spacing).toBeCloseTo(1 - 116 / 150)
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
