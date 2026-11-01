import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { loadAutomerge } from '@/sync/automerge'
import type { Automerge } from '@/sync/automerge'
import { memoryStore } from '@/sync/offlineStore'
import type { OfflineStore } from '@/sync/offlineStore'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'
import SectionView from '@/views/SectionView.vue'

import { followMoves, rescueStoredCopies, resetRescued } from './redirects'

let A: typeof Automerge
beforeAll(async () => {
  A = await loadAutomerge()
})

async function stored(store: OfflineStore, id: string, text: string) {
  const doc = A.change(A.init<{ content: string }>(), (d) => {
    d.content = text
  })
  await store.put({
    documentId: id,
    epoch: 'e',
    actorId: A.getActorId(doc),
    bytes: A.save(doc),
    serverHeads: [],
    savedAt: 0,
  })
}

const ref = (type: string, id: string) => ({ type, id, path: `x/${id}`, name: id })

describe('redirects', () => {
  afterEach(() => {
    setApiClient(null)
    resetRescued()
  })

  it('re-keys stored copies of moved documents only', async () => {
    const store = memoryStore()
    await stored(store, 'd-old', 'offline')
    await stored(store, 'r-old', 'not a document')
    await followMoves(
      [
        { type: 'document', oldId: 'd-old', newId: 'd-new' },
        { type: 'resource', oldId: 'r-old', newId: 'r-new' },
      ],
      store,
    )
    expect((await store.keys()).sort()).toEqual(['d-new', 'r-old'])
  })

  it('rescues copies whose ids the tree does not know, asking once per id', async () => {
    const store = memoryStore()
    await stored(store, 'd-known', 'a')
    await stored(store, 'd-moved', 'b')
    await stored(store, 'd-gone', 'c')
    const mock = createFetchMock({
      'GET /moved/d-moved/': () =>
        json({ oldId: 'd-moved', type: 'document', item: ref('document', 'd-here'), movedAt: '' }),
      'GET /moved/d-gone/': () => json({ code: 'not-found' }, 404),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    await rescueStoredCopies((id) => id === 'd-known', store)
    expect((await store.keys()).sort()).toEqual(['d-gone', 'd-here', 'd-known'])
    await rescueStoredCopies((id) => id === 'd-known' || id === 'd-here', store)
    expect(mock.requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/moved/d-moved/',
      '/moved/d-gone/',
    ])
  })

  it('sends a folder view of an old id to the folder now', async () => {
    const mock = createFetchMock({
      'GET /section/': () => json(sampleTree()),
      'GET /moved/s-alt/': () =>
        json({ oldId: 's-alt', type: 'section', item: ref('section', 's-kuchen'), movedAt: '' }),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const { router, wrapper } = await mountWithPlugins(SectionView, {
      props: { id: 's-alt' },
      initialPath: '/section/s-alt',
    })
    await useTreeStore().load()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/section/s-kuchen'))
    wrapper.unmount()
  })
})
