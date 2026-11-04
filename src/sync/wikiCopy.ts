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

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

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
  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE)
  const range = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`)

  return {
    async get(key) {
      try {
        return (await done((await store('readonly')).get(key))) ?? (await fallback.get(key))
      } catch {
        return fallback.get(key)
      }
    },
    async put(key, value) {
      try {
        await done((await store('readwrite')).put(value, key))
      } catch {
        await fallback.put(key, value)
      }
    },
    async delete(key) {
      await fallback.delete(key)
      try {
        await done((await store('readwrite')).delete(key))
      } catch {
        // nothing stored then
      }
    },
    async list(prefix) {
      const memory = await fallback.list(prefix)
      try {
        const objects = await store('readonly')
        const [keys, values] = await Promise.all([
          done(objects.getAllKeys(range(prefix))),
          done(objects.getAll(range(prefix))),
        ])
        return [...keys.map((key, i): [string, unknown] => [String(key), values[i]]), ...memory]
      } catch {
        return memory
      }
    },
    async deleteAll(prefix) {
      await fallback.deleteAll(prefix)
      try {
        await done((await store('readwrite')).delete(range(prefix)))
      } catch {
        // nothing stored then
      }
    },
  }
}

let records: Records | null = null

/** The copy of whoever is signed in now. */
export function wikiCopy(): WikiCopy {
  records ??= typeof indexedDB === 'undefined' ? memoryRecords() : indexedDbRecords()
  const raw = records
  const user = useAuthStore().user
  const prefix = `${encodeURIComponent(user ? (user.id ?? user.username) : '')}:`
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
