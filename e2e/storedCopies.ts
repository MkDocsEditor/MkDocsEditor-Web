import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** The keys of the stored copies in the browser. */
export function storedCopyKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('mkdocseditor')
        open.onerror = () => reject(open.error as Error)
        open.onsuccess = () => {
          const request = open.result.transaction('documents').objectStore('documents').getAllKeys()
          request.onerror = () => reject(request.error as Error)
          request.onsuccess = () => {
            open.result.close()
            resolve(request.result as string[])
          }
        }
      }),
  )
}

/** Turns the stored copy of a document into a record of an older version, which has no owner. */
export function makeStoredCopyOwnerless(page: Page, documentId: string): Promise<void> {
  return page.evaluate(
    (id) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mkdocseditor')
        open.onerror = () => reject(open.error as Error)
        open.onsuccess = () => {
          const transaction = open.result.transaction('documents', 'readwrite')
          const store = transaction.objectStore('documents')
          const keys = store.getAllKeys()
          keys.onsuccess = () => {
            const key = (keys.result as string[]).find((k) => k.endsWith(id))
            if (!key) throw new Error(`no stored copy of ${id}`)
            const read = store.get(key)
            read.onsuccess = () => {
              store.delete(key)
              store.put({ ...read.result, documentId: id })
            }
          }
          transaction.onerror = () => reject(transaction.error as Error)
          transaction.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
    documentId,
  )
}

/**
 * Waits until the stored copy of a document was written after `time` (`browserNow`). Copies are
 * written a moment after the last change.
 */
export async function storedCopyWritten(
  page: Page,
  documentId: string,
  time: number,
): Promise<void> {
  const savedAt = () =>
    page.evaluate(
      (id) =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open('mkdocseditor')
          open.onerror = () => reject(open.error as Error)
          open.onsuccess = () => {
            const store = open.result.transaction('documents').objectStore('documents')
            const all = store.getAll()
            all.onerror = () => reject(all.error as Error)
            all.onsuccess = () => {
              open.result.close()
              const copies = all.result as { documentId: string; savedAt: number }[]
              resolve(copies.find((copy) => copy.documentId.endsWith(id))?.savedAt ?? 0)
            }
          }
        }),
      documentId,
    )
  await expect.poll(savedAt).toBeGreaterThanOrEqual(time)
}

/** The clock of the browser, which is the one stored copies are stamped with. */
export function browserNow(page: Page): Promise<number> {
  return page.evaluate(() => Date.now())
}
