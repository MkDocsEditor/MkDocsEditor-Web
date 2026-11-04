import { describe, expect, it } from 'vitest'

import { accountStore, memoryStore, refusedCopyId, unownedStore } from './offlineStore'
import type { StoredCopy } from './offlineStore'

function copy(documentId: string): StoredCopy {
  return {
    documentId,
    epoch: 'e',
    actorId: 'a',
    bytes: new Uint8Array([1, 2]),
    serverHeads: [],
    savedAt: 0,
  }
}

describe('offline store', () => {
  it('keeps a copy of the bytes it was given', async () => {
    const store = memoryStore()
    const original = copy('d')
    await store.put(original)
    original.bytes[0] = 9
    expect((await store.get('d'))?.bytes[0]).toBe(1)
  })

  it('lets one holder claim a document at a time', async () => {
    const store = memoryStore()
    const release = await store.claim('d')
    expect(release).not.toBeNull()
    expect(await store.claim('d')).toBeNull()
    release?.()
    expect(await store.claim('d')).not.toBeNull()
  })

  it('keeps the copies and claims of accounts apart', async () => {
    const raw = memoryStore()
    const anna = accountStore(raw, 'anna')
    const ben = accountStore(raw, 'ben')
    await anna.put(copy('d'))
    expect((await anna.get('d'))?.documentId).toBe('d')
    expect(await ben.get('d')).toBeUndefined()
    expect(await ben.keys()).toEqual([])
    expect(await anna.claim('d')).not.toBeNull()
    expect(await ben.claim('d')).not.toBeNull()
  })

  it('escapes account ids, so one account cannot read into another', async () => {
    const raw = memoryStore()
    await accountStore(raw, 'a:b').put(copy('d'))
    expect(await accountStore(raw, 'a').get('b:d')).toBeUndefined()
  })

  it('does not list copies that were set aside', async () => {
    const raw = memoryStore()
    const anna = accountStore(raw, 'anna')
    await anna.put(copy('d'))
    await anna.put(copy(refusedCopyId('d', 'a')))
    expect(await anna.keys()).toEqual(['d'])
  })

  it('lists only records without an owner as unowned', async () => {
    const raw = memoryStore()
    await raw.put(copy('old'))
    await accountStore(raw, 'anna').put(copy('d'))
    await raw.put(copy(refusedCopyId('x', 'a')))
    expect(await unownedStore(raw).keys()).toEqual(['old'])
  })
})
