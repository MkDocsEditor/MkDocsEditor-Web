import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { FeedEntry, FeedPage } from '@/api'

const getFeed = vi.fn<(before?: string) => Promise<FeedPage | null>>()
vi.mock('@/api', () => ({ useApi: () => ({ getFeed }) }))

import { useLiveStore } from '@/stores/live'

import { useFeed } from './useFeed'

const at = (id: string, minute: number): FeedEntry => ({
  id,
  time: `2026-11-06T10:${String(minute).padStart(2, '0')}:00Z`,
  kind: 'edited',
  itemType: 'document',
  path: `${id}.md`,
  authors: [],
})

describe('useFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getFeed.mockReset()
  })

  it('loads older pages, and a changed first page moves an entry back to the top', async () => {
    const feed = useFeed()
    getFeed.mockResolvedValueOnce({ entries: [at('c', 30), at('b', 20)], next: 'p2' })
    await feed.refresh()
    getFeed.mockResolvedValueOnce({ entries: [at('a', 10)], next: null })
    await feed.loadMore()
    expect(getFeed).toHaveBeenLastCalledWith('p2', 30)
    expect(feed.entries.value.map((e) => e.id)).toEqual(['c', 'b', 'a'])
    expect(feed.next.value).toBeNull()

    // someone went on editing "a": the server says so, and the first page has it again
    getFeed.mockResolvedValueOnce({ entries: [at('a', 40), at('c', 30)], next: 'p2' })
    useLiveStore().feedVersion++
    await nextTick()
    await vi.waitFor(() => expect(feed.entries.value.map((e) => e.id)).toEqual(['a', 'c', 'b']))
  })

  it('knows a server without a feed', async () => {
    const feed = useFeed()
    getFeed.mockResolvedValueOnce(null)
    await feed.refresh()
    expect(feed.available.value).toBe(false)
    useLiveStore().feedVersion++
    await nextTick()
    expect(getFeed).toHaveBeenCalledTimes(1)
  })
})
