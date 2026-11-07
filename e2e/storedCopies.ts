import type { Page } from '@playwright/test'
import * as A from '@automerge/automerge'

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
 * The text of the stored copy of a document, or null without one. Read from the copy itself:
 * when it was written says nothing about which edits it holds, a copy can be written while
 * typing (the switch to offline writes one, for example).
 */
export async function storedCopyText(page: Page, documentId: string): Promise<string | null> {
  const bytes = await page.evaluate(
    (id) =>
      new Promise<number[] | null>((resolve, reject) => {
        const open = indexedDB.open('mkdocseditor')
        open.onerror = () => reject(open.error as Error)
        open.onsuccess = () => {
          const store = open.result.transaction('documents').objectStore('documents')
          const all = store.getAll()
          all.onerror = () => reject(all.error as Error)
          all.onsuccess = () => {
            open.result.close()
            const copies = all.result as { documentId: string; bytes: Uint8Array }[]
            const copy = copies.find((c) => c.documentId.endsWith(id))
            resolve(copy ? [...copy.bytes] : null)
          }
        }
      }),
    documentId,
  )
  return bytes ? A.load<{ content: string }>(new Uint8Array(bytes)).content : null
}
