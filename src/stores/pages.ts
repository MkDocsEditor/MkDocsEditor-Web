import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'

import { ApiError, useApi } from '@/api'
import type { DocumentModel, SectionModel } from '@/api'
import { wikiCopy } from '@/sync/wikiCopy'
import type { StoredPage } from '@/sync/wikiCopy'

import { useTreeStore } from './tree'

/** Server errors in a row that end a run. One broken page must not stop the others for good. */
const MAX_SERVER_FAILURES = 3
/** Search runs again whenever the pages change, so tell it only every few pages. */
const PAGES_PER_UPDATE = 10

function documentsOf(section: SectionModel): DocumentModel[] {
  return [...section.documents, ...section.subsections.flatMap(documentsOf)]
}

/** The text of all pages on this device, kept up to date in the background, for search. */
export const usePagesStore = defineStore('pages', () => {
  const pages = shallowRef<Map<string, StoredPage>>(new Map())
  /** While pages are being fetched; search only knows the others until then. */
  const progress = ref<{ done: number; total: number } | null>(null)
  let loaded = false
  let running = false
  let again = false
  /** Goes up on sign-out: a run of the previous account must not store anything more. */
  let generation = 0

  async function run(root: SectionModel, current: number): Promise<void> {
    const copy = wikiCopy()
    if (!loaded) {
      const stored = await copy.pages()
      if (current !== generation) return
      pages.value = stored
      loaded = true
    }
    const documents = documentsOf(root)
    const ids = new Set(documents.map((d) => d.id))
    for (const id of [...pages.value.keys()]) {
      if (ids.has(id)) continue
      pages.value.delete(id)
      await copy.deletePage(id)
    }
    triggerRef(pages)

    const outdated = documents.filter((d) => pages.value.get(d.id)?.modtime !== d.modtime)
    if (outdated.length === 0) return
    progress.value = { done: 0, total: outdated.length }
    let serverFailures = 0
    let fetched = 0
    try {
      for (const document of outdated) {
        let text: string
        try {
          text = await useApi().getDocumentContent(document.id)
          serverFailures = 0
        } catch (error) {
          // The same goes for all other pages; the next load of the tree tries again.
          if (!(error instanceof ApiError)) throw error
          if (error.isNetworkError || error.isUnauthorized || error.isRateLimited) return
          if (error.status >= 500 && ++serverFailures >= MAX_SERVER_FAILURES) return
          console.warn('mkdocseditor: could not fetch page', document.id, error)
          continue
        } finally {
          if (current === generation && progress.value) progress.value.done++
        }
        if (current !== generation) return
        const page = { text, modtime: document.modtime }
        pages.value.set(document.id, page)
        if (++fetched % PAGES_PER_UPDATE === 0) triggerRef(pages)
        await copy.putPage(document.id, page)
      }
    } finally {
      if (current === generation) triggerRef(pages)
    }
  }

  /** Fetches the pages that changed since the last time. Runs after every load of the tree. */
  async function sync(): Promise<void> {
    if (running) {
      again = true
      return
    }
    running = true
    const current = generation
    try {
      do {
        again = false
        const root = useTreeStore().root
        if (root) await run(root, current)
      } while (again && current === generation)
    } finally {
      if (current === generation) {
        running = false
        progress.value = null
      }
    }
  }

  /**
   * The text of a page as it is here, which can differ from the server's: an older local copy, or
   * edits it refused. Without a `modtime`, the next sync fetches the page in any case.
   */
  function edited(id: string, text: string): void {
    const page = { text, modtime: '' }
    pages.value.set(id, page)
    triggerRef(pages)
    void wikiCopy().putPage(id, page)
  }

  /** Forgets what is in memory, for the next account. */
  function reset(): void {
    generation++
    running = false
    loaded = false
    progress.value = null
    pages.value = new Map()
  }

  return { pages, progress, sync, edited, reset }
})
