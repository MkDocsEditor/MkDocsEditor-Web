/** Runs one request in its own transaction of an object store. */
export type Transact = <T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
) => Promise<T>

/**
 * Opens an object store of an IndexedDB database on first use. `upgrade` creates the store. The
 * result resolves once the transaction is committed: a full disk only fails at that point.
 */
export function idbStore(
  databaseName: string,
  storeName: string,
  upgrade: (database: IDBDatabase) => void,
): Transact {
  let database: Promise<IDBDatabase> | null = null
  const open = () =>
    (database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => upgrade(request.result)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }))

  return async (mode, work) => {
    const transaction = (await open()).transaction(storeName, mode)
    return new Promise((resolve, reject) => {
      const request = work(transaction.objectStore(storeName))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  }
}
