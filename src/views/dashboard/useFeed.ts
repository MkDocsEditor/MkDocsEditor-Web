import { ref, shallowRef, watch } from 'vue'

import { useApi } from '@/api'
import type { FeedEntry } from '@/api'
import { useLiveStore } from '@/stores/live'

const PAGE_SIZE = 30

/**
 * The feed of changes, newest first, a page at a time. When the server says it changed, the
 * first page is fetched again and replaces the entries it overlaps: an editing session that went
 * on moves back to the top.
 */
export function useFeed() {
  const entries = shallowRef<FeedEntry[]>([])
  const next = ref<string | null>(null)
  /** Null until the first answer; false on a server without a feed. */
  const available = ref<boolean | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let generation = 0

  async function refresh(): Promise<void> {
    const mine = ++generation
    loading.value = true
    try {
      const page = await useApi().getFeed(undefined, PAGE_SIZE)
      if (mine !== generation) return
      available.value = page !== null
      if (!page) return
      const fresh = new Set(page.entries.map((e) => e.id))
      const oldest = page.entries.at(-1)?.time
      // the older entries that were loaded already stay, unless the first page has them now
      const older =
        page.next === null || oldest === undefined
          ? []
          : entries.value.filter((e) => !fresh.has(e.id) && e.time < oldest)
      entries.value = [...page.entries, ...older]
      if (older.length === 0) next.value = page.next
      error.value = null
    } catch (e) {
      if (mine === generation) error.value = e
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!next.value || loading.value) return
    const mine = ++generation
    loading.value = true
    try {
      const page = await useApi().getFeed(next.value, PAGE_SIZE)
      if (mine !== generation || !page) return
      const known = new Set(entries.value.map((e) => e.id))
      entries.value = [...entries.value, ...page.entries.filter((e) => !known.has(e.id))]
      next.value = page.next
      error.value = null
    } catch (e) {
      if (mine === generation) error.value = e
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  const live = useLiveStore()
  watch(
    () => live.feedVersion,
    () => {
      if (available.value !== false) void refresh()
    },
  )

  return { entries, next, available, loading, error, refresh, loadMore }
}
