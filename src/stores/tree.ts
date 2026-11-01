import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useApi } from '@/api'
import type { DocumentModel, ResourceModel, SectionModel, TreeItem } from '@/api'
import type { LinkTarget } from '@/services/linkPath'
import { sanitizeFileName, shrinkImage, uniqueName } from '@/services/upload'

import {
  ancestorsOf,
  indexTree,
  linkTargetOf,
  pathOf,
  resolveRelative,
  searchTree,
} from './treeIndex'
import type { SearchHit, TreeIndex } from './treeIndex'

/** The section/document/resource tree of the wiki. */
export const useTreeStore = defineStore('tree', () => {
  const root = shallowRef<SectionModel | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const index = computed<TreeIndex>(() =>
    root.value ? indexTree(root.value) : { items: new Map(), parents: new Map() },
  )

  let pending: Promise<void> | null = null

  /** Loads the tree. Concurrent calls share one request. */
  function load(): Promise<void> {
    pending ??= (async () => {
      loading.value = true
      try {
        root.value = await useApi().getTree()
        error.value = null
      } catch (e) {
        error.value = e
        throw e
      } finally {
        loading.value = false
        pending = null
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
    root.value = null
    error.value = null
  }

  return {
    root,
    loading,
    error,
    load,
    ensureLoaded,
    get,
    section,
    document,
    parentOf,
    ancestors,
    path,
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
