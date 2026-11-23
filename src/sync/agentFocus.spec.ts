import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  WAIT_LIMIT_MS,
  clampedFocus,
  codePointIndex,
  focusAnchors,
  resolveAnchors,
  revisionOf,
  utf16Index,
} from './agentFocus'
import { loadAutomerge } from './automerge'
import type { AmDoc, AutomergeApi } from './automerge'
import { createPresence } from './presence'
import type { AgentFocus, PresenceInfo } from './protocol'

let A: AutomergeApi
beforeAll(async () => {
  A = await loadAutomerge()
})

const revisionAt = (doc: AmDoc) => revisionOf(A.getHeads(doc))

/** Where a focus made at `doc` is in `later`. */
function resolvedIn(doc: AmDoc, later: AmDoc, focus: Omit<AgentFocus, 'revision'>) {
  const anchors = focusAnchors(A, later, { ...focus, revision: revisionAt(doc) })
  return anchors && resolveAnchors(A, later, anchors)
}

describe('agent focus', () => {
  it('counts code points, as the backend does', () => {
    expect(utf16Index('a😀b', 2)).toBe(3)
    expect(utf16Index('a😀b', 9)).toBe(4)
  })

  it('stays on its text when people insert before it afterwards', () => {
    const doc = A.from({ content: 'hello world' })
    const later = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 0, 0, '😀 Hey, '))
    // "world" at the revision of the focus
    expect(resolvedIn(doc, later, { from: 6, to: 11 })).toEqual({
      selections: [{ anchor: 14, head: 19 }],
    })
  })

  it('keeps an end-of-text focus where it was when people append', () => {
    const doc = A.from({ content: 'Ende' })
    const later = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 4, 0, ' und mehr'))
    expect(resolvedIn(doc, later, { from: 4, to: 4 })?.selections).toEqual([{ anchor: 4, head: 4 }])
  })

  it('resolves a viewport and the start of an empty text', () => {
    const doc = A.from({ content: '' })
    const later = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 0, 0, 'neu'))
    expect(resolvedIn(doc, later, { from: 0, to: 0, viewport: { top: 0, bottom: 0 } })).toEqual({
      selections: [{ anchor: 0, head: 0 }],
      viewport: { top: 0, bottom: 0 },
    })
  })

  it('takes no heads as the empty document, without waiting', () => {
    const doc = A.change(A.from({ content: '' }), (d) => A.splice(d, ['content'], 0, 0, 'neu'))
    const anchors = focusAnchors(A, doc, { revision: '', from: 0, to: 0 })
    expect(anchors && resolveAnchors(A, doc, anchors).selections).toEqual([{ anchor: 0, head: 0 }])
  })

  it('does not go past the text when the last character is deleted', () => {
    const doc = A.from({ content: 'abc xyz' })
    const later = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 6, 1))
    expect(resolvedIn(doc, later, { from: 7, to: 7 })?.selections).toEqual([{ anchor: 6, head: 6 }])
  })

  it('waits for a revision the document does not have', () => {
    const doc = A.from({ content: 'eins' })
    const ahead = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 4, 0, ' zwei'))
    expect(focusAnchors(A, doc, { revision: revisionAt(ahead), from: 0, to: 0 })).toBeNull()
  })

  it('clamps the indexes to the current text when the revision never comes', () => {
    expect(clampedFocus('ab', { revision: 'x', from: 1, to: 9 }).selections).toEqual([
      { anchor: 1, head: 2 },
    ])
  })
})

describe('presence of an agent with a focus', () => {
  afterEach(() => void vi.useRealTimers())

  const agentOf = (focus: AgentFocus): PresenceInfo => ({
    clientId: 'agent-1',
    instanceId: 'agent-1',
    accountId: 'anna',
    username: 'anna',
    selections: [],
    agent: { tokenId: 't1', name: 'claude', focus },
  })

  function setup(doc: () => AmDoc) {
    return createPresence({
      automerge: () => A,
      doc,
      documentId: () => 'doc',
      ownInstance: () => 'own',
      isSynced: () => true,
      send: vi.fn(),
      presenceMs: 100,
    })
  }

  it('clamps a revision that makes no sense here, and the others stay listed', () => {
    const doc = A.from({ content: 'hello world' })
    const presence = setup(() => doc)
    presence.update(agentOf({ revision: 'not-a-hash', from: 1, to: 2 }))
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 1, head: 2 }])
  })

  it('keeps the ghost of an agent where its focus was', () => {
    const doc = A.from({ content: 'hello world' })
    const presence = setup(() => doc)
    presence.update(agentOf({ revision: revisionAt(doc), from: 6, to: 11 }))
    presence.remove({
      clientId: 'agent-1',
      instanceId: 'agent-1',
      accountId: 'anna',
      ghostMs: 1000,
    })
    expect(presence.ghosts.value[0]!.selections).toEqual([{ anchor: 6, head: 11 }])
    presence.stop()
  })

  it('shows the agent at its focus, like the cursor of a person', () => {
    const doc = A.from({ content: 'hello world' })
    const presence = setup(() => doc)
    presence.update(agentOf({ revision: revisionAt(doc), from: 6, to: 11 }))
    expect(presence.peers.value[0]).toMatchObject({ selections: [{ anchor: 6, head: 11 }] })
  })

  it('waits for the revision, then applies the indexes to the current text', () => {
    vi.useFakeTimers()
    let doc = A.from({ content: 'eins' })
    const ahead = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 0, 0, 'null '))
    const presence = setup(() => doc)
    presence.update(agentOf({ revision: revisionAt(ahead), from: 0, to: 4 }))
    expect(presence.peers.value[0]!.selections).toEqual([])

    // the change arrives: the focus is on "null"
    doc = A.merge(A.clone(doc), ahead)
    presence.resolve()
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 0, head: 4 }])

    // a revision that never comes: after the wait limit, the indexes as they are
    const never = A.change(A.clone(ahead), (d) => A.splice(d, ['content'], 0, 0, '!'))
    presence.update(agentOf({ revision: revisionAt(never), from: 5, to: 9 }))
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 0, head: 4 }])
    vi.advanceTimersByTime(WAIT_LIMIT_MS)
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 5, head: 9 }])
    presence.stop()
  })
})

describe('codePointIndex', () => {
  it('counts a pair of UTF-16 units as one code point', () => {
    const text = 'a😀b'
    expect(codePointIndex(text, 0)).toBe(0)
    expect(codePointIndex(text, 1)).toBe(1)
    expect(codePointIndex(text, 3)).toBe(2)
    expect(codePointIndex(text, 4)).toBe(3)
    // beyond the end: the length
    expect(codePointIndex(text, 99)).toBe(3)
    // the inverse of utf16Index
    expect(utf16Index(text, codePointIndex(text, 3))).toBe(3)
  })

  it('sorts heads into a revision', () => {
    expect(revisionOf(['b', 'a'])).toBe('a.b')
    expect(revisionOf([])).toBe('')
  })
})
