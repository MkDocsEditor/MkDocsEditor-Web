import { ChangeSet, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { applyChanges, diffText } from '@/sync/session'
import { createFakeSession } from '@/test/fakeSession'

import { authorship, authorshipDecorations, lineShares, setAuthorship } from './authorship'
import { fromChangeSet, sessionBinding, toChangeSet } from './binding'
import { peerDecorations, remoteCursors, setPeers, withAlpha } from './remoteCursors'

function editor(initial: string) {
  const fake = createFakeSession(initial)
  const view = new EditorView({
    state: EditorState.create({
      doc: fake.session.getText(),
      extensions: [sessionBinding(fake.session), remoteCursors(), authorship()],
    }),
    parent: document.body,
  })
  return { fake, view }
}

describe('change conversion', () => {
  it('converts multi-range ChangeSets to sequential changes and back', () => {
    const doc = 'Hallo Welt, schöne Welt'
    const set = ChangeSet.of(
      [
        { from: 0, to: 5, insert: 'Servus' },
        { from: 12, to: 18, insert: '' },
        { from: 23, insert: '!' },
      ],
      doc.length,
    )
    const expected = set.apply(EditorState.create({ doc }).doc).toString()
    const sequential = fromChangeSet(set)
    expect(applyChanges(doc, sequential)).toBe(expected)
    const roundTrip = toChangeSet(sequential, doc.length)
    expect(roundTrip.apply(EditorState.create({ doc }).doc).toString()).toBe(expected)
  })
})

describe('diffText', () => {
  it('finds a minimal replacement', () => {
    expect(diffText('abcdef', 'abXYef')).toEqual([{ from: 2, to: 4, insert: 'XY' }])
    expect(diffText('same', 'same')).toEqual([])
    expect(applyChanges('Grüße', diffText('Grüße', 'Grüß Gott'))).toBe('Grüß Gott')
  })

  it('does not split surrogate pairs', () => {
    const [change] = diffText('a😀b', 'a😃b')
    expect(change).toEqual({ from: 1, to: 3, insert: '😃' })
  })
})

describe('sessionBinding', () => {
  it('sends local edits to the session', () => {
    const { fake, view } = editor('Hallo')
    view.dispatch({ changes: { from: 5, insert: ' Welt' } })
    expect(fake.text).toBe('Hallo Welt')
    expect(fake.localChanges).toEqual([[{ from: 5, to: 5, insert: ' Welt' }]])
    view.destroy()
  })

  it('applies remote edits without echoing them and keeps the local cursor', () => {
    const { fake, view } = editor('Hallo Welt')
    view.dispatch({ selection: EditorSelection.cursor(10) })
    fake.remote([{ from: 0, to: 0, insert: 'Oh, ' }])
    expect(view.state.doc.toString()).toBe('Oh, Hallo Welt')
    expect(view.state.selection.main.head).toBe(14)
    expect(fake.localChanges).toEqual([])
    view.destroy()
  })

  it('keeps remote changes out of the undo history', async () => {
    const { undo } = await import('@codemirror/commands')
    const { history } = await import('@codemirror/commands')
    const fake = createFakeSession('a')
    const view = new EditorView({
      state: EditorState.create({
        doc: 'a',
        extensions: [history(), sessionBinding(fake.session)],
      }),
      parent: document.body,
    })
    view.dispatch({ changes: { from: 1, insert: 'b' } })
    fake.remote([{ from: 0, to: 0, insert: 'X' }])
    undo(view)
    expect(view.state.doc.toString()).toBe('Xa')
    expect(fake.text).toBe('Xa')
    view.destroy()
  })

  it('publishes selections only while focused', () => {
    const { fake, view } = editor('Hallo')
    view.dispatch({ selection: EditorSelection.range(0, 3) })
    expect(fake.selections.at(-1)).toEqual([]) // not focused in jsdom
    view.destroy()
    expect(fake.selections.at(-1)).toEqual([])
  })
})

describe('remote cursors', () => {
  const peer = {
    clientId: 'c1',
    username: 'anna',
    displayName: 'Anna',
    color: '#1971c2',
    selections: [{ anchor: 2, head: 5 }],
  }

  it('builds a selection mark and a labelled caret per peer', () => {
    const set = peerDecorations([peer], 10)
    const found: { from: number; to: number }[] = []
    set.between(0, 10, (from, to) => {
      found.push({ from, to })
    })
    expect(found).toEqual([
      { from: 2, to: 5 },
      { from: 5, to: 5 },
    ])
  })

  it('clamps positions beyond the document and renders the name', () => {
    const { view } = editor('kurz')
    view.dispatch({ effects: setPeers.of([{ ...peer, selections: [{ anchor: 99, head: 99 }] }]) })
    const label = view.dom.querySelector('.cm-remote-caret-label')
    expect(label?.textContent).toBe('Anna')
    view.destroy()
  })

  it('moves decorations with local edits', () => {
    const { view } = editor('Hallo Welt')
    view.dispatch({ effects: setPeers.of([{ ...peer, selections: [{ anchor: 6, head: 6 }] }]) })
    view.dispatch({ changes: { from: 0, insert: '>> ' } })
    // the caret moved along and still sits right before "Welt"
    const line = view.dom.querySelector('.cm-line')
    const caret = line?.querySelector('.cm-remote-caret')
    expect(caret).not.toBeNull()
    const before = document.createRange()
    before.setStart(line!, 0)
    before.setEndBefore(caret!)
    expect(before.toString()).toBe('>> Hallo ')
    view.destroy()
  })

  it('adds transparency to colours', () => {
    expect(withAlpha('#1971c2', 0.25)).toBe('#1971c240')
    expect(withAlpha('#abc', 1)).toBe('#aabbccff')
    expect(withAlpha('red', 0.5)).toBe('red')
  })
})

describe('authorship', () => {
  const runs = [
    { from: 0, to: 5, username: 'anna', color: '#1971c2' },
    { from: 5, to: 10, username: 'ben', color: '#e8590c' },
  ]

  it('keeps only runs inside the text, and none when off', () => {
    expect(authorshipDecorations({ runs, mode: 'off' }, 10).size).toBe(0)
    expect(authorshipDecorations({ runs, mode: 'marker' }, 10).size).toBe(2)
    expect(authorshipDecorations({ runs, mode: 'strip' }, 7).size).toBe(2)
    expect(authorshipDecorations({ runs, mode: 'marker' }, 3).size).toBe(1)
  })

  it('renders the marker with 14 % alpha and the author as title', () => {
    const { view } = editor('HalloWelt!')
    view.dispatch({ effects: setAuthorship.of({ runs, mode: 'marker' }) })
    const marks = [...view.dom.querySelectorAll<HTMLElement>('.cm-author')]
    expect(marks.map((e) => e.title)).toEqual(['anna', 'ben'])
    expect(marks[0]!.style.backgroundColor).toBe('rgba(25, 113, 194, 0.14)')
    view.destroy()
  })

  it('shows strip and marker per mode, and takes no room when off', () => {
    const { view } = editor('HalloWelt!')
    const parts = () => view.dom.querySelectorAll('.cm-author-strip > div').length
    const gutter = () => view.dom.querySelector('.cm-author-gutter')
    expect(gutter()).toBeNull()

    view.dispatch({ effects: setAuthorship.of({ runs, mode: 'marker' }) })
    expect(view.dom.querySelectorAll('.cm-author')).toHaveLength(2)
    expect(parts()).toBe(2)

    view.dispatch({ effects: setAuthorship.of({ runs, mode: 'strip' }) })
    expect(view.dom.querySelectorAll('.cm-author')).toHaveLength(0)
    expect(parts()).toBe(2)

    view.dispatch({ effects: setAuthorship.of({ runs, mode: 'off' }) })
    expect(view.dom.querySelectorAll('.cm-author')).toHaveLength(0)
    expect(gutter()).toBeNull()
    view.destroy()
  })

  it('takes no room when no text has an author', () => {
    const { view } = editor('HalloWelt!')
    view.dispatch({ effects: setAuthorship.of({ runs: [], mode: 'marker' }) })
    expect(view.dom.querySelector('.cm-author-gutter')).toBeNull()
    view.destroy()
  })

  it('splits the strip by the share of each author on the line', () => {
    const { view } = editor('HalloWelt!\nzwei\ndrei')
    view.dispatch({
      effects: setAuthorship.of({
        runs: [
          { from: 0, to: 5, username: 'anna', color: '#1971c2' },
          { from: 5, to: 13, username: 'ben', color: '#e8590c' },
        ],
        mode: 'strip',
      }),
    })
    const strips = [...view.dom.querySelectorAll('.cm-author-strip')].map((strip) =>
      [...strip.children].map((part) => [
        (part as HTMLElement).title,
        (part as HTMLElement).style.height,
      ]),
    )
    expect(strips).toEqual([
      [
        ['anna', '50%'],
        ['ben', '50%'],
      ],
      [['ben', '50%']],
    ])
    view.destroy()
  })

  it('leaves text without an author out of the shares, and empty lines without any', () => {
    const spans = authorshipDecorations(
      { runs: [{ from: 1, to: 2, username: 'anna', color: '#1971c2' }], mode: 'strip' },
      10,
    )
    expect(lineShares(spans, 0, 4)).toEqual([
      { username: 'anna', color: '#1971c2', fraction: 0.25 },
    ])
    expect(lineShares(spans, 2, 2)).toEqual([])
  })
})
