import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { WAIT_LIMIT_MS, clampedFocus, focusAnchors, resolveAnchors, utf16Index } from './agentFocus'
import { loadAutomerge } from './automerge'
import type { AmDoc, AutomergeApi } from './automerge'
import { createPresence } from './presence'
import type { AgentFocus, PresenceInfo } from './protocol'

let A: AutomergeApi
beforeAll(async () => {
  A = await loadAutomerge()
})

const revisionOf = (doc: AmDoc) => [...A.getHeads(doc)].sort().join('.')

/** Where a focus made at `doc` is in `later`. */
function resolvedIn(doc: AmDoc, later: AmDoc, focus: Omit<AgentFocus, 'revision'>) {
  const anchors = focusAnchors(A, later, { ...focus, revision: revisionOf(doc) })
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

  it('waits for a revision the document does not have', () => {
    const doc = A.from({ content: 'eins' })
    const ahead = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 4, 0, ' zwei'))
    expect(focusAnchors(A, doc, { revision: revisionOf(ahead), from: 0, to: 0 })).toBeNull()
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

  it('shows the agent at its focus, like the cursor of a person', () => {
    const doc = A.from({ content: 'hello world' })
    const presence = setup(() => doc)
    presence.update(agentOf({ revision: revisionOf(doc), from: 6, to: 11 }))
    expect(presence.peers.value[0]).toMatchObject({ selections: [{ anchor: 6, head: 11 }] })
  })

  it('waits for the revision, then applies the indexes to the current text', () => {
    vi.useFakeTimers()
    let doc = A.from({ content: 'eins' })
    const ahead = A.change(A.clone(doc), (d) => A.splice(d, ['content'], 0, 0, 'null '))
    const presence = setup(() => doc)
    presence.update(agentOf({ revision: revisionOf(ahead), from: 0, to: 4 }))
    expect(presence.peers.value[0]!.selections).toEqual([])

    // the change arrives: the focus is on "null"
    doc = A.merge(A.clone(doc), ahead)
    presence.resolve()
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 0, head: 4 }])

    // a revision that never comes: after the wait limit, the indexes as they are
    const never = A.change(A.clone(ahead), (d) => A.splice(d, ['content'], 0, 0, '!'))
    presence.update(agentOf({ revision: revisionOf(never), from: 5, to: 9 }))
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 0, head: 4 }])
    vi.advanceTimersByTime(WAIT_LIMIT_MS)
    expect(presence.peers.value[0]!.selections).toEqual([{ anchor: 5, head: 9 }])
    presence.stop()
  })
})
