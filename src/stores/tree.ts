import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { ApiError, useApi } from '@/api'
import type { DocumentModel, ResourceModel, SectionModel, TreeItem } from '@/api'
import type { LinkTarget } from '@/services/linkPath'
import { sanitizeFileName, shrinkImage, uniqueName } from '@/services/upload'
import { wikiCopy } from '@/sync/wikiCopy'
import type { WikiCopy } from '@/sync/wikiCopy'

import {
  ancestorsOf,
  indexTree,
  linkTargetOf,
  pathOf,
  resolveRelative,
  searchTree,
} from '@/services/treeIndex'
import type { SearchHit, TreeIndex } from '@/services/treeIndex'

/** The section/document/resource tree of the wiki. */
export const useTreeStore = defineStore('tree', () => {
  const root = shallowRef<SectionModel | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  /** When the tree was last loaded, as milliseconds; null until it was. */
  const lastSync = ref<number | null>(null)
  const index = computed<TreeIndex>(() =>
    root.value ? indexTree(root.value) : { items: new Map(), parents: new Map() },
  )

  let pending: Promise<void> | null = null
  /** Goes up on `reset`: a load still running then belongs to the previous account. */
  let generation = 0

  /** Without an answer from the server, the stored tree is better than nothing. */
  async function restore(failure: unknown, copy: WikiCopy, current: number): Promise<void> {
    if (root.value) return
    if (!(failure instanceof ApiError) || !(failure.isNetworkError || failure.status >= 500)) return
    const stored = await copy.tree()
    if (!stored || root.value || current !== generation) return
    root.value = stored.root
    lastSync.value = stored.syncedAt
  }

  /** Loads the tree. Concurrent calls share one request. */
  function load(): Promise<void> {
    pending ??= (async () => {
      const current = generation
      const copy = wikiCopy()
      loading.value = true
      try {
        const loaded = await useApi().getTree()
        if (current !== generation) return
        root.value = loaded
        error.value = null
        lastSync.value = Date.now()
        void copy.putTree({ root: loaded, syncedAt: lastSync.value })
      } catch (e) {
        if (current !== generation) return
        error.value = e
        await restore(e, copy, current)
        throw e
      } finally {
        if (current === generation) {
          loading.value = false
          pending = null
        }
      }
    })()
    return pending
  }

  async function ensureLoaded(): Promise<void> {
    if (!root.value) await load()
  }

  function get(id: string): TreeItem | undefined {
    return index.value.items.get(id)
  }

  function section(id: string): SectionModel | undefined {
    const item = get(id)
    return item?.type === 'section' ? item : undefined
  }

  function document(id: string): DocumentModel | undefined {
    const item = get(id)
    return item?.type === 'document' ? item : undefined
  }

  function parentOf(id: string): SectionModel | undefined {
    const parentId = index.value.parents.get(id)
    return parentId === undefined ? undefined : section(parentId)
  }

  function ancestors(id: string): SectionModel[] {
    return ancestorsOf(index.value, id)
  }

  function resolve(fromSectionId: string, href: string): TreeItem | undefined {
    const from = section(fromSectionId)
    return from ? resolveRelative(index.value, from, href) : undefined
  }

  function path(id: string): string {
    return pathOf(index.value, id)
  }

  /** The server answered elsewhere (a page synced): "Synced …" counts it like a load. */
  function markAnswered(): void {
    if (root.value) lastSync.value = Date.now()
  }

  /** The item at a path relative to the docs folder (as the feed names them), if there is one. */
  function byPath(path: string): TreeItem | undefined {
    const wanted = path.replace(/^\/+|\/+$/g, '')
    for (const id of index.value.items.keys())
      if (pathOf(index.value, id) === wanted) return index.value.items.get(id)
    return undefined
  }

  /** A folder's path for sentences; the root has no path of its own. */
  function folderLabel(id: string): string {
    return path(id) || 'Wiki (top folder)'
  }

  function linkTarget(item: TreeItem): LinkTarget {
    return linkTargetOf(index.value, item)
  }

  function search(query: string): SearchHit[] {
    return searchTree(index.value, query)
  }

  async function mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = await action()
    await load()
    return result
  }

  const api = () => useApi()

  /**
   * Uploads files into a section under unique, safe names (large photos are scaled down).
   * Returns the created resources in order. Reloads the tree once at the end.
   */
  async function uploadFiles(sectionId: string, files: readonly File[]): Promise<ResourceModel[]> {
    const created: ResourceModel[] = []
    try {
      for (const file of files) {
        const current = section(sectionId)
        if (!current) throw new Error('Folder not found')
        const name = uniqueName(
          { ...current, resources: [...current.resources, ...created] },
          sanitizeFileName(file.name),
        )
        created.push(await api().uploadResource(sectionId, name, await shrinkImage(file)))
      }
    } finally {
      await load()
    }
    return created
  }

  function reset(): void {
    generation++
    pending = null
    loading.value = false
    root.value = null
    lastSync.value = null
    error.value = null
  }

  return {
    root,
    index,
    loading,
    error,
    lastSync,
    load,
    ensureLoaded,
    get,
    section,
    document,
    parentOf,
    ancestors,
    path,
    byPath,
    markAnswered,
    folderLabel,
    linkTarget,
    search,
    resolve,
    reset,
    uploadFiles,
    createSection: (parentId: string, name: string) =>
      mutate(() => api().createSection(parentId, name)),
    renameSection: (id: string, name: string) => mutate(() => api().renameSection(id, name)),
    deleteSection: (id: string, force = false) => mutate(() => api().deleteSection(id, force)),
    createDocument: (parentId: string, name: string) =>
      mutate(() => api().createDocument(parentId, name)),
    renameDocument: (id: string, name: string) => mutate(() => api().renameDocument(id, name)),
    deleteDocument: (id: string, force = false) => mutate(() => api().deleteDocument(id, force)),
    renameResource: (id: string, name: string) => mutate(() => api().renameResource(id, name)),
    deleteResource: (id: string) => mutate(() => api().deleteResource(id)),
  }
})
