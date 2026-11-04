import { idbStore } from './idb'

/**
 * Persists local document copies, so edits survive reloads and offline periods.
 *
 * One record per document: the Automerge bytes, the actor id of this copy, the server epoch and
 * the heads the server is known to have. Only one tab at a time owns a document's record (see
 * `claim`), because two live copies must never share an actor id.
 *
 * A copy belongs to the account that made it (`accountStore`): the server binds its actor id to
 * that account, so nobody else can publish its edits. Records of older versions have no owner
 * yet (`unownedStore`).
 */
export interface StoredCopy {
  documentId: string
  epoch: string
  actorId: string
  /** Automerge `save()` of the local copy. */
  bytes: Uint8Array
  /** Heads of the last completed sync with the server. */
  serverHeads: string[]
  /** Last known answer of the server; the editor stays read-only until it says otherwise. */
  readOnly?: boolean
  /** For display and debugging. */
  savedAt: number
}

export interface OfflineStore {
  get(documentId: string): Promise<StoredCopy | undefined>
  put(copy: StoredCopy): Promise<void>
  delete(documentId: string): Promise<void>
  /** Ids of all stored copies. */
  keys(): Promise<string[]>
  /**
   * Claims the record of a document for this tab. Resolves to a release function, or null when
   * another tab holds it (this tab then works with an unpersisted copy).
   */
  claim(documentId: string): Promise<(() => void) | null>
}

export function memoryStore(): OfflineStore {
  const records = new Map<string, StoredCopy>()
  const claimed = new Set<string>()
  return {
    get: async (id) => records.get(id),
    put: async (copy) => {
      records.set(copy.documentId, { ...copy, bytes: copy.bytes.slice() })
    },
    delete: async (id) => {
      records.delete(id)
    },
    keys: async () => [...records.keys()],
    claim: async (id) => {
      if (claimed.has(id)) return null
      claimed.add(id)
      return () => claimed.delete(id)
    },
  }
}

const ACCOUNT_PREFIX = 'account:'
const REFUSED_PREFIX = 'refused:'

/**
 * Where a copy goes whose actor the server refused. Nothing reads it any more, and nothing deletes
 * it: only a person could still recover its edits from the browser's storage.
 */
export function refusedCopyId(documentId: string, actorId: string): string {
  return `${REFUSED_PREFIX}${actorId}:${documentId}`
}

/** The copies of one account: their keys and claims are separate from all other accounts. */
export function accountStore(inner: OfflineStore, accountId: string): OfflineStore {
  const prefix = `${ACCOUNT_PREFIX}${encodeURIComponent(accountId)}:`
  return {
    get: async (id) => {
      const copy = await inner.get(prefix + id)
      return copy && { ...copy, documentId: id }
    },
    put: (copy) => inner.put({ ...copy, documentId: prefix + copy.documentId }),
    delete: (id) => inner.delete(prefix + id),
    keys: async () =>
      (await inner.keys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
        .filter((id) => !id.startsWith(REFUSED_PREFIX)),
    claim: (id) => inner.claim(prefix + id),
  }
}

/** The records without an owner, under the plain document id. */
export function unownedStore(inner: OfflineStore): OfflineStore {
  return {
    ...inner,
    keys: async () =>
      (await inner.keys()).filter(
        (key) => !key.startsWith(ACCOUNT_PREFIX) && !key.startsWith(REFUSED_PREFIX),
      ),
  }
}

const DB_NAME = 'mkdocseditor'
const STORE = 'documents'

/** IndexedDB store; falls back to memory when IndexedDB is unavailable (private mode). */
function indexedDbStore(): OfflineStore {
  const withStore = idbStore(DB_NAME, STORE, (database) =>
    database.createObjectStore(STORE, { keyPath: 'documentId' }),
  )
  const fallback = memoryStore()

  return {
    async get(id) {
      try {
        return (await withStore('readonly', (s) => s.get(id))) as StoredCopy | undefined
      } catch {
        return fallback.get(id)
      }
    },
    async put(copy) {
      try {
        await withStore('readwrite', (s) => s.put(copy))
      } catch {
        await fallback.put(copy)
      }
    },
    async delete(id) {
      try {
        await withStore('readwrite', (s) => s.delete(id))
      } catch {
        await fallback.delete(id)
      }
    },
    async keys() {
      try {
        const keys = (await withStore('readonly', (s) => s.getAllKeys())) as string[]
        return [...new Set([...keys, ...(await fallback.keys())])]
      } catch {
        return fallback.keys()
      }
    },
    async claim(id) {
      const locks = (globalThis.navigator as Navigator | undefined)?.locks
      if (!locks) return fallback.claim(id)
      return new Promise((resolve) => {
        void locks.request(`mkdocseditor-doc-${id}`, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(null)
            return
          }
          // Hold the lock until released.
          return new Promise<void>((release) => resolve(() => release()))
        })
      })
    },
  }
}

let defaultStore: OfflineStore | null = null

export function getOfflineStore(): OfflineStore {
  defaultStore ??= typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore()
  return defaultStore
}
