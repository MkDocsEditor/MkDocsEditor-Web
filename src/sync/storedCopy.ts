import type { OfflineStore, StoredCopy } from './offlineStore'

export interface StoredCopyOptions {
  store: OfflineStore
  persistMs: number
  /** How often to try again for a claim that another tab held; see `retryClaim`. */
  retryClaimMs: number
  /** The current id of the document. */
  documentId: () => string
  /** The current copy, or null while there is nothing to persist. */
  snapshot: () => Pick<
    StoredCopy,
    'epoch' | 'actorId' | 'bytes' | 'serverHeads' | 'readOnly'
  > | null
  /**
   * A claim that another tab held came through. The session takes in what the record holds; if
   * it returns false, the record stays as it is and this tab keeps working without it.
   */
  onLateClaim: (existing: StoredCopy | undefined) => boolean
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
  let closed = false
  let claiming = false
  let lastClaimAt = 0

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
  /**
   * Another tab held the record when this session started, and without it edits here do not
   * survive a reload. That tab may be gone by now, so ask again while there are changes to keep.
   */
  async function retryClaim(): Promise<void> {
    if (closed || claiming || Date.now() - lastClaimAt < options.retryClaimMs) return
    claiming = true
    lastClaimAt = Date.now()
    try {
      const id = options.documentId()
      const claim = await options.store.claim(id)
      if (!claim) return
      const existing = closed ? undefined : await options.store.get(id)
      if (closed || !options.onLateClaim(existing)) {
        claim()
        return
      }
      storedId = id
      release = claim
      schedule()
    } catch (error) {
      console.error('mkdocseditor: could not claim the local copy', error)
    } finally {
      claiming = false
    }
  }

  function schedule(): void {
    if (!release) {
      void retryClaim()
      return
    }
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      void persist()
    }, options.persistMs)
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
      lastClaimAt = Date.now()
      const claim = await options.store.claim(id)
      if (closed) {
        claim?.()
        return undefined
      }
      release = claim
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
      if (closed) {
        claim()
        return
      }
      const previous = release
      release = claim
      previous?.()
    },
    schedule,
    watchPage(): void {
      globalThis.addEventListener?.('pagehide', persistPending)
      globalThis.addEventListener?.('beforeunload', persistPending)
      globalThis.document?.addEventListener('visibilitychange', onHidden)
    },
    /** Writes the copy one last time and gives up the claim. */
    close(): void {
      closed = true
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
