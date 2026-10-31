/**
 * Persists local document copies, so edits survive reloads and offline periods.
 *
 * One record per document: the Automerge bytes, the actor id of this copy, the server epoch and
 * the heads the server is known to have. Only one tab at a time owns a document's record (see
 * `claim`), because two live copies must never share an actor id.
 */
export interface StoredCopy {
  documentId: string
  epoch: string
  actorId: string
  /** Automerge `save()` of the local copy. */
  bytes: Uint8Array
  /** Heads of the last completed sync with the server. */
  serverHeads: string[]
  /** For display and debugging. */
  savedAt: number
}

export interface OfflineStore {
  get(documentId: string): Promise<StoredCopy | undefined>
  put(copy: StoredCopy): Promise<void>
  delete(documentId: string): Promise<void>
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
    claim: async (id) => {
      if (claimed.has(id)) return null
      claimed.add(id)
      return () => claimed.delete(id)
    },
  }
}

const DB_NAME = 'mkdocseditor'
const STORE = 'documents'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** IndexedDB store; falls back to memory when IndexedDB is unavailable (private mode). */
export function indexedDbStore(): OfflineStore {
  let dbPromise: Promise<IDBDatabase> | null = null
  const open = () =>
    (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'documentId' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const fallback = memoryStore()

  async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open()
    return request(fn(db.transaction(STORE, mode).objectStore(STORE)))
  }

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
