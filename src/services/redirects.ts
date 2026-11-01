import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'

import { useApi } from '@/api'
import type { MovedItem } from '@/api'
import { loadAutomerge } from '@/sync/automerge'
import { getOfflineStore } from '@/sync/offlineStore'
import type { OfflineStore } from '@/sync/offlineStore'
import { rekeyStoredCopy } from '@/sync/rekey'

/**
 * Follows moves for the offline copies of documents (`docs/references.md` section 7): a copy
 * stored under an old id is re-keyed to the new id, so its unsynced edits reach the moved
 * document. A copy is never dropped because its id is unknown.
 */
export async function followMoves(
  moves: readonly Pick<MovedItem, 'type' | 'oldId' | 'newId'>[],
  store: OfflineStore = getOfflineStore(),
): Promise<void> {
  for (const move of moves) {
    if (move.type !== 'document') continue
    try {
      await rekeyStoredCopy(store, loadAutomerge, move.oldId, move.newId)
    } catch (error) {
      console.error('mkdocseditor: could not move the local copy', move.oldId, error)
    }
  }
}

const checked = new Set<string>()

/**
 * Looks up stored copies whose ids are not in the tree (moves this client missed while it was
 * offline) through `GET /moved/{id}/` and re-keys them. Each id is asked once per page load.
 */
export async function rescueStoredCopies(
  known: (id: string) => boolean,
  store: OfflineStore = getOfflineStore(),
): Promise<void> {
  let ids: string[]
  try {
    ids = await store.keys()
  } catch {
    return
  }
  for (const id of ids) {
    if (known(id) || checked.has(id)) continue
    checked.add(id)
    try {
      const moved = await useApi().getMoved(id)
      if (moved?.item.type === 'document')
        await followMoves([{ type: 'document', oldId: id, newId: moved.item.id }], store)
    } catch {
      // unreachable: ask again on the next page load
      checked.delete(id)
    }
  }
}

/**
 * For views of folders and files: when the tree is loaded and has no item with the route's id,
 * asks `GET /moved/{id}/` and replaces the route with the item's new id (bookmarks and links
 * from before a move). `looking` is true while the answer is pending.
 */
export function useMovedRedirect(
  id: () => string,
  routeName: 'section' | 'resource',
  missing: () => boolean,
): Ref<boolean> {
  const router = useRouter()
  const looking = ref(false)
  watch(
    () => [id(), missing()] as const,
    async ([current, isMissing]) => {
      if (!isMissing || !current) return
      looking.value = true
      try {
        const moved = await useApi().getMoved(current)
        if (moved && moved.item.type === routeName && id() === current)
          await router.replace({ name: routeName, params: { id: moved.item.id } })
      } catch {
        // offline: show "not found"
      } finally {
        if (id() === current) looking.value = false
      }
    },
    { immediate: true },
  )
  return looking
}

/** For tests. */
export function resetRescued(): void {
  checked.clear()
}
