import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useApi } from '@/api'
import type { DocumentModel, ResourceModel, SectionModel, TreeItem } from '@/api'

export interface TreeIndex {
  items: Map<string, TreeItem>
  parents: Map<string, string>
}

/** Builds lookup maps (id to item, id to parent section id) for a section tree. */
export function indexTree(root: SectionModel): TreeIndex {
  const items = new Map<string, TreeItem>()
  const parents = new Map<string, string>()
  const visit = (section: SectionModel) => {
    items.set(section.id, section)
    for (const child of [...section.documents, ...section.resources]) {
      items.set(child.id, child)
      parents.set(child.id, section.id)
    }
    for (const sub of section.subsections) {
      parents.set(sub.id, section.id)
      visit(sub)
    }
  }
  visit(root)
  return { items, parents }
}

/** Sections from the root down to (and including) the parent of the given item. */
export function ancestorsOf(index: TreeIndex, id: string): SectionModel[] {
  const chain: SectionModel[] = []
  let current = index.parents.get(id)
  while (current !== undefined) {
    const section = index.items.get(current)
    if (section?.type !== 'section') break
    chain.unshift(section)
    current = index.parents.get(current)
  }
  return chain
}

export interface SearchHit {
  item: DocumentModel | SectionModel | ResourceModel
  /** Names of the sections above the item, without the root. */
  path: string[]
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Finds items whose name contains every word of the query (case and accent insensitive). */
export function searchTree(index: TreeIndex, query: string, limit = 50): SearchHit[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const rank = { document: 0, section: 1, resource: 2 }
  const hits: SearchHit[] = []
  for (const item of index.items.values()) {
    if (!index.parents.has(item.id)) continue // the root itself
    const name = normalize(item.name)
    if (!words.every((w) => name.includes(w))) continue
    hits.push({
      item,
      path: ancestorsOf(index, item.id)
        .slice(1)
        .map((s) => s.name),
    })
  }
  hits.sort(
    (a, b) => rank[a.item.type] - rank[b.item.type] || a.item.name.localeCompare(b.item.name, 'de'),
  )
  return hits.slice(0, limit)
}

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

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

  function search(query: string): SearchHit[] {
    return searchTree(index.value, query)
  }

  async function mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = await action()
    await load()
    return result
  }

  const api = () => useApi()

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
    search,
    reset,
    createSection: (parentId: string, name: string) =>
      mutate(() => api().createSection(parentId, name)),
    renameSection: (id: string, name: string) => mutate(() => api().renameSection(id, name)),
    deleteSection: (id: string) => mutate(() => api().deleteSection(id)),
    createDocument: (parentId: string, name: string) =>
      mutate(() => api().createDocument(parentId, name)),
    renameDocument: (id: string, name: string) => mutate(() => api().renameDocument(id, name)),
    deleteDocument: (id: string) => mutate(() => api().deleteDocument(id)),
    uploadResource: (parentId: string, name: string, file: Blob) =>
      mutate(() => api().uploadResource(parentId, name, file)),
    renameResource: (id: string, name: string) => mutate(() => api().renameResource(id, name)),
    deleteResource: (id: string) => mutate(() => api().deleteResource(id)),
  }
})
