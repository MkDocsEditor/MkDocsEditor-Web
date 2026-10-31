import { ChangeSet, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { applyChanges, diffText } from '@/sync/session'
import { createFakeSession } from '@/test/fakeSession'

import { authorship, authorshipDecorations, setAuthorship } from './authorship'
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

  it('marks runs only when visible', () => {
    expect(authorshipDecorations({ runs, visible: false }, 10).size).toBe(0)
    expect(authorshipDecorations({ runs, visible: true }, 10).size).toBe(2)
    expect(authorshipDecorations({ runs, visible: true }, 7).size).toBe(2)
    expect(authorshipDecorations({ runs, visible: true }, 3).size).toBe(1)
  })

  it('renders author titles in the editor', () => {
    const { view } = editor('HalloWelt!')
    view.dispatch({ effects: setAuthorship.of({ runs, visible: true }) })
    const titles = [...view.dom.querySelectorAll('.cm-author')].map((e) => e.getAttribute('title'))
    expect(titles).toEqual(['anna', 'ben'])
    view.destroy()
  })
})
