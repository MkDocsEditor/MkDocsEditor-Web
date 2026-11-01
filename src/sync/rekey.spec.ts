import { beforeAll, describe, expect, it } from 'vitest'

import { loadAutomerge } from './automerge'
import type { Automerge } from './automerge'
import { memoryStore } from './offlineStore'
import type { OfflineStore, StoredCopy } from './offlineStore'
import { rekeyStoredCopy } from './rekey'

let A: typeof Automerge
beforeAll(async () => {
  A = await loadAutomerge()
})

const ACTOR_A = 'aa'.repeat(16)
const ACTOR_B = 'bb'.repeat(16)

function copy(id: string, doc: Automerge.Doc<{ content: string }>, actorId: string, epoch = 'e1') {
  return {
    documentId: id,
    epoch,
    actorId,
    bytes: A.save(doc),
    serverHeads: [],
    savedAt: 0,
  } satisfies StoredCopy
}

const content = async (store: OfflineStore, id: string) =>
  A.load<{ content: string }>((await store.get(id))!.bytes).content

function base() {
  return A.change(A.init<{ content: string }>({ actor: '01'.repeat(16) }), (d) => {
    d.content = 'Text'
  })
}

describe('rekeyStoredCopy', () => {
  it('moves a copy to the new id', async () => {
    const store = memoryStore()
    const doc = A.change(A.clone(base(), { actor: ACTOR_A }), (d) => {
      A.splice(d, ['content'], 4, 0, ' offline')
    })
    await store.put(copy('old', doc, ACTOR_A))
    expect(await rekeyStoredCopy(store, loadAutomerge, 'old', 'new')).toBe('moved')
    expect(await store.keys()).toEqual(['new'])
    expect(await content(store, 'new')).toBe('Text offline')
    expect((await store.get('new'))!.actorId).toBe(ACTOR_A)
  })

  it('merges with a copy of the same lineage under the new id', async () => {
    const store = memoryStore()
    const old = A.change(A.clone(base(), { actor: ACTOR_A }), (d) => {
      A.splice(d, ['content'], 0, 0, 'Alt: ')
    })
    const fresh = A.change(A.clone(base(), { actor: ACTOR_B }), (d) => {
      A.splice(d, ['content'], 4, 0, ' neu')
    })
    await store.put(copy('old', old, ACTOR_A))
    await store.put(copy('new', fresh, ACTOR_B))
    expect(await rekeyStoredCopy(store, loadAutomerge, 'old', 'new')).toBe('merged')
    expect(await store.keys()).toEqual(['new'])
    expect(await content(store, 'new')).toBe('Alt: Text neu')
    expect((await store.get('new'))!.actorId).toBe(ACTOR_B)
  })

  it('keeps the copy when the new id holds another lineage or is open in a tab', async () => {
    const store = memoryStore()
    await store.put(copy('old', base(), ACTOR_A))
    await store.put(copy('new', base(), ACTOR_B, 'e2'))
    expect(await rekeyStoredCopy(store, loadAutomerge, 'old', 'new')).toBe('kept')
    expect((await store.keys()).sort()).toEqual(['new', 'old'])

    await store.delete('new')
    const tab = await store.claim('new')
    expect(await rekeyStoredCopy(store, loadAutomerge, 'old', 'new')).toBe('kept')
    tab?.()
    const other = await store.claim('old')
    expect(await rekeyStoredCopy(store, loadAutomerge, 'old', 'new')).toBe('kept')
    other?.()
    expect(await store.keys()).toEqual(['old'])
  })

  it('does nothing without a copy', async () => {
    expect(await rekeyStoredCopy(memoryStore(), loadAutomerge, 'old', 'new')).toBe('none')
  })
})
