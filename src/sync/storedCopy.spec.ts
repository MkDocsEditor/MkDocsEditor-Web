import { afterEach, describe, expect, it, vi } from 'vitest'

import { memoryStore } from './offlineStore'
import type { OfflineStore } from './offlineStore'
import { createStoredCopy } from './storedCopy'

const contents = { epoch: 'e1', actorId: 'a1', bytes: new Uint8Array([1]), serverHeads: ['h1'] }

/** A store that records the order of its writes. */
function recordingStore(): { store: OfflineStore; writes: string[] } {
  const store = memoryStore()
  const writes: string[] = []
  return {
    writes,
    store: {
      ...store,
      put: (copy) => (writes.push(`put ${copy.documentId}`), store.put(copy)),
      delete: (id) => (writes.push(`delete ${id}`), store.delete(id)),
    },
  }
}

function setup(store: OfflineStore, persistMs = 10_000) {
  return createStoredCopy({ store, persistMs, snapshot: () => contents })
}

describe('createStoredCopy', () => {
  afterEach(() => vi.useRealTimers())

  it('writes under the new id before the old record goes', async () => {
    const { store, writes } = recordingStore()
    const copy = setup(store)
    await copy.open('old')
    await copy.moveTo('new', (await store.claim('new'))!)
    expect(writes).toEqual(['put new', 'delete old'])
    expect(copy.isStoredAs('new')).toBe(true)
    // the claim of the old id is free again
    expect(await store.claim('old')).not.toBeNull()
  })

  it('writes nothing without the claim', async () => {
    const { store, writes } = recordingStore()
    await store.claim('doc')
    const copy = setup(store)
    expect(await copy.open('doc')).toBeUndefined()
    expect(copy.claimed).toBe(false)
    await copy.persist()
    expect(writes).toEqual([])
  })

  it('groups changes into one delayed write', async () => {
    vi.useFakeTimers()
    const { store, writes } = recordingStore()
    const copy = setup(store, 300)
    await copy.open('doc')
    copy.schedule()
    copy.schedule()
    await vi.advanceTimersByTimeAsync(299)
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(writes).toEqual(['put doc'])
  })

  it('writes a pending change right away when the page goes away', async () => {
    const { store, writes } = recordingStore()
    const copy = setup(store)
    await copy.open('doc')
    copy.watchPage()
    window.dispatchEvent(new Event('pagehide'))
    expect(writes).toEqual([]) // nothing was pending
    copy.schedule()
    window.dispatchEvent(new Event('pagehide'))
    expect(writes).toEqual(['put doc'])
    copy.close()
  })

  it('writes once more on close and gives up the claim', async () => {
    const { store, writes } = recordingStore()
    const copy = setup(store)
    await copy.open('doc')
    copy.close()
    await vi.waitFor(() => expect(copy.claimed).toBe(false))
    expect(writes).toEqual(['put doc'])
    expect(await store.claim('doc')).not.toBeNull()
  })
})
