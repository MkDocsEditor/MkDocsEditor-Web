import type { Automerge } from './automerge'
import type { OfflineStore } from './offlineStore'

/**
 * What happened to a stored copy: moved to the new id, merged into a copy that was already
 * there, kept under the old id (another tab holds one of the ids, or the copy there belongs to
 * another document), or there was none.
 */
export type RekeyResult = 'moved' | 'merged' | 'kept' | 'none'

/**
 * Moves the offline copy of a document from its old id to its new id after a move or rename
 * (`docs/references.md` section 7, client rules). The copy is written under the new id before
 * the old record is deleted, so a crash in between leaves two copies, never none. A copy that
 * already exists under the new id with the same epoch is merged (both are Automerge documents
 * of the same lineage); with another epoch both stay as they are.
 */
export async function rekeyStoredCopy(
  store: OfflineStore,
  automerge: () => Promise<typeof Automerge>,
  oldId: string,
  newId: string,
): Promise<RekeyResult> {
  if (oldId === newId) return 'none'
  const releaseOld = await store.claim(oldId)
  // another tab has the document open; its session follows the rename itself
  if (!releaseOld) return 'kept'
  try {
    const copy = await store.get(oldId)
    if (!copy) return 'none'
    const releaseNew = await store.claim(newId)
    if (!releaseNew) return 'kept'
    try {
      const existing = await store.get(newId)
      if (!existing) {
        await store.put({ ...copy, documentId: newId, savedAt: Date.now() })
      } else if (existing.epoch === copy.epoch) {
        const A = await automerge()
        const merged = A.merge(
          A.load<{ content: string }>(existing.bytes, { actor: existing.actorId }),
          A.load<{ content: string }>(copy.bytes, { actor: copy.actorId }),
        )
        await store.put({ ...existing, bytes: A.save(merged), savedAt: Date.now() })
      } else {
        return 'kept'
      }
      await store.delete(oldId)
      return existing ? 'merged' : 'moved'
    } finally {
      releaseNew()
    }
  } finally {
    releaseOld()
  }
}
