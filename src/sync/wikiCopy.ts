import type { SectionModel } from '@/api'
import { useAuthStore } from '@/stores/auth'

/** The text of a page as this client last got it. */
export interface StoredPage {
  text: string
  /** `modtime` of the page in the tree at that time; a different one means it needs fetching. */
  modtime: string
}

export interface StoredTree {
  root: SectionModel
  /** When it was loaded, in milliseconds. */
  syncedAt: number
}

/**
 * The wiki of one account on this device, like the database of the Android app: the tree and the
 * text of all pages, so search works on everything and the wiki can be browsed offline. It is only
 * a copy of the server's data. Edits are kept in the offline store (`offlineStore.ts`).
 */
export interface WikiCopy {
  tree(): Promise<StoredTree | undefined>
  putTree(tree: StoredTree): Promise<void>
  pages(): Promise<Map<string, StoredPage>>
  putPage(id: string, page: StoredPage): Promise<void>
  deletePage(id: string): Promise<void>
  clear(): Promise<void>
}

interface Records {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** All records whose key starts with `prefix`, as [key, value]. */
  list(prefix: string): Promise<[string, unknown][]>
  deleteAll(prefix: string): Promise<void>
}

function memoryRecords(): Records {
  const records = new Map<string, unknown>()
  return {
    get: async (key) => records.get(key),
    put: async (key, value) => {
      records.set(key, value)
    },
    delete: async (key) => {
      records.delete(key)
    },
    list: async (prefix) => [...records].filter(([key]) => key.startsWith(prefix)),
    deleteAll: async (prefix) => {
      for (const key of [...records.keys()]) if (key.startsWith(prefix)) records.delete(key)
    },
  }
}

const DB_NAME = 'mkdocseditor-wiki'
const STORE = 'records'

/** Falls back to memory when IndexedDB is unavailable or full: the copy is then lost on reload. */
function indexedDbRecords(): Records {
  const fallback = memoryRecords()
  let database: Promise<IDBDatabase> | null = null
  const open = () =>
    (database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }))

  /** Resolves once the transaction is committed: a full disk only fails at that point. */
  async function transact<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const transaction = (await open()).transaction(STORE, mode)
    return new Promise<T>((resolve, reject) => {
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  }
  const range = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}\uffff`)

  // A value is in memory only when IndexedDB refused it, so memory is always the newer one.
  return {
    async get(key) {
      const memory = await fallback.get(key)
      if (memory !== undefined) return memory
      try {
        return await transact('readonly', (store) => store.get(key))
      } catch {
        return undefined
      }
    },
    async put(key, value) {
      try {
        await transact('readwrite', (store) => store.put(value, key))
        await fallback.delete(key)
      } catch {
        await fallback.put(key, value)
      }
    },
    async delete(key) {
      await fallback.delete(key)
      try {
        await transact('readwrite', (store) => store.delete(key))
      } catch {
        // nothing stored then
      }
    },
    async list(prefix) {
      const memory = await fallback.list(prefix)
      try {
        const keys = await transact('readonly', (store) => store.getAllKeys(range(prefix)))
        const values = await transact('readonly', (store) => store.getAll(range(prefix)))
        const stored = keys.map((key, i): [string, unknown] => [String(key), values[i]])
        return [...new Map([...stored, ...memory])]
      } catch {
        return memory
      }
    },
    async deleteAll(prefix) {
      await fallback.deleteAll(prefix)
      try {
        await transact('readwrite', (store) => store.delete(range(prefix)))
      } catch {
        // nothing stored then
      }
    },
  }
}

let records: Records | null = null

/** Who is signed in now, for keeping local data apart; empty on a server without login. */
export function accountKey(): string {
  const user = useAuthStore().user
  return encodeURIComponent(user ? (user.id ?? user.username) : '')
}

/**
 * The copy of whoever is signed in now. Whatever finishes later, such as a load in progress, has to
 * keep this object: by then somebody else can be signed in.
 */
export function wikiCopy(): WikiCopy {
  records ??= typeof indexedDB === 'undefined' ? memoryRecords() : indexedDbRecords()
  const raw = records
  const prefix = `${accountKey()}:`
  const treeKey = `${prefix}tree`
  const pagePrefix = `${prefix}page:`
  return {
    tree: async () => (await raw.get(treeKey)) as StoredTree | undefined,
    // through JSON: the tree can be reactive, and IndexedDB does not take proxies
    putTree: (tree) => raw.put(treeKey, JSON.parse(JSON.stringify(tree))),
    pages: async () =>
      new Map(
        (await raw.list(pagePrefix)).map(([key, value]) => [
          key.slice(pagePrefix.length),
          value as StoredPage,
        ]),
      ),
    putPage: (id, page) => raw.put(pagePrefix + id, page),
    deletePage: (id) => raw.delete(pagePrefix + id),
    clear: () => raw.deleteAll(prefix),
  }
}
