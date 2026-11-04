import { useApi } from '@/api'
import type { MovedItem } from '@/api'

import { loadAutomerge } from './automerge'
import { movableCopies } from './localCopies'
import type { OfflineStore } from './offlineStore'
import { rekeyStoredCopy } from './rekey'

/**
 * Follows moves for the offline copies of documents (`docs/references.md` section 7): a copy
 * stored under an old id is re-keyed to the new id, so its unsynced edits reach the moved
 * document. A copy is never dropped because its id is unknown.
 */
export async function followMoves(
  moves: readonly Pick<MovedItem, 'type' | 'oldId' | 'newId'>[],
  stores: readonly OfflineStore[] = movableCopies(),
): Promise<void> {
  for (const move of moves) {
    if (move.type !== 'document') continue
    for (const store of stores) {
      try {
        await rekeyStoredCopy(store, loadAutomerge, move.oldId, move.newId)
      } catch (error) {
        console.error('mkdocseditor: could not move the local copy', move.oldId, error)
      }
    }
  }
}

/** Per store, because each account has its own copies and may sign in during one page load. */
let checked = new WeakMap<OfflineStore, Set<string>>()

/**
 * Looks up stored copies whose ids are not in the tree (moves this client missed while it was
 * offline) through `GET /moved/{id}/` and re-keys them. Each id is asked once per page load.
 */
export async function rescueStoredCopies(
  known: (id: string) => boolean,
  stores: readonly OfflineStore[] = movableCopies(),
): Promise<void> {
  for (const store of stores) {
    let ids: string[]
    try {
      ids = await store.keys()
    } catch {
      continue
    }
    let seen = checked.get(store)
    if (!seen) checked.set(store, (seen = new Set()))
    for (const id of ids) {
      if (known(id) || seen.has(id)) continue
      seen.add(id)
      try {
        const moved = await useApi().getMoved(id)
        if (moved?.item.type === 'document')
          await followMoves([{ type: 'document', oldId: id, newId: moved.item.id }], [store])
      } catch {
        // unreachable: ask again on the next page load
        seen.delete(id)
      }
    }
  }
}

/** For tests. */
export function resetRescued(): void {
  checked = new WeakMap()
}
