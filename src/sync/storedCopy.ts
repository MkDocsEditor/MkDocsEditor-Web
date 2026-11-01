import type { OfflineStore, StoredCopy } from './offlineStore'

export interface StoredCopyOptions {
  store: OfflineStore
  persistMs: number
  /** The current copy, or null while there is nothing to persist. */
  snapshot: () => Pick<StoredCopy, 'epoch' | 'actorId' | 'bytes' | 'serverHeads'> | null
}

/**
 * Keeps the persisted copy of a session's document: holds the claim on its record, writes
 * changes shortly after they happen, and right away when the page is hidden or closed.
 */
export function createStoredCopy(options: StoredCopyOptions) {
  let release: (() => void) | null = null
  /** Id under which the copy is persisted; stays the old id while a rename cannot take over. */
  let storedId = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  async function persist(): Promise<void> {
    if (!release) return
    const copy = options.snapshot()
    if (!copy) return
    await options.store.put({ ...copy, documentId: storedId, savedAt: Date.now() })
  }

  function persistPending(): void {
    if (!timer) return
    clearTimeout(timer)
    timer = null
    void persist()
  }
  const onHidden = () => {
    if (globalThis.document?.visibilityState !== 'visible') persistPending()
  }

  return {
    persist,
    get claimed(): boolean {
      return release !== null
    },
    isStoredAs(id: string): boolean {
      return release !== null && storedId === id
    },
    /** Claims the record of `id` and returns what it holds (nothing if another tab owns it). */
    async open(id: string): Promise<StoredCopy | undefined> {
      storedId = id
      release = await options.store.claim(id)
      return release ? options.store.get(id) : undefined
    },
    /**
     * Moves the copy to `newId`, whose claim is `claim`. The copy is written under the new id
     * before the old record goes, so a crash leaves two copies, never none.
     */
    async moveTo(newId: string, claim: () => void): Promise<void> {
      const oldId = storedId
      storedId = newId
      await persist()
      await options.store.delete(oldId)
      const previous = release
      release = claim
      previous?.()
    },
    schedule(): void {
      if (!release || timer) return
      timer = setTimeout(() => {
        timer = null
        void persist()
      }, options.persistMs)
    },
    watchPage(): void {
      globalThis.addEventListener?.('pagehide', persistPending)
      globalThis.addEventListener?.('beforeunload', persistPending)
      globalThis.document?.addEventListener('visibilitychange', onHidden)
    },
    /** Writes the copy one last time and gives up the claim. */
    close(): void {
      globalThis.removeEventListener?.('pagehide', persistPending)
      globalThis.removeEventListener?.('beforeunload', persistPending)
      globalThis.document?.removeEventListener('visibilitychange', onHidden)
      if (timer) clearTimeout(timer)
      timer = null
      void persist().finally(() => {
        release?.()
        release = null
      })
    },
  }
}
