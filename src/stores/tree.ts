import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useApi } from '@/api'
import type { DocumentModel, ResourceModel, SectionModel, TreeItem } from '@/api'
import { sanitizeFileName, shrinkImage, uniqueName } from '@/services/upload'

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
  return text.toLocaleLowerCase('en').normalize('NFD').replace(/[̀-ͯ]/g, '')
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
    (a, b) => rank[a.item.type] - rank[b.item.type] || a.item.name.localeCompare(b.item.name, 'en'),
  )
  return hits.slice(0, limit)
}

/**
 * Resolves a relative link from a page in `section` (as written in markdown) to a tree item.
 * Handles `./`, `../`, URL encoding, `#fragments`, `.md` files, and MkDocs directory URLs
 * (`../Other/` for `Other.md` or `Other/index.md`). Returns undefined for absolute URLs.
 */
export function resolveRelative(
  index: TreeIndex,
  section: SectionModel,
  href: string,
): TreeItem | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) {
    return undefined
  }
  const path = href.split(/[?#]/)[0] ?? ''
  if (path === '') return undefined
  let segments: string[]
  try {
    segments = path.split('/').map((s) => decodeURIComponent(s))
  } catch {
    return undefined
  }
  let current: SectionModel | undefined = section
  if (path.startsWith('/')) {
    current = ancestorsOf(index, section.id)[0] ?? section
    segments = segments.slice(1)
  }
  const directoryUrl = segments.at(-1) === ''
  if (directoryUrl) segments.pop()
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    const last = i === segments.length - 1
    if (segment === '.' || segment === '') continue
    if (segment === '..') {
      const parentId = index.parents.get(current.id)
      const parent = parentId === undefined ? undefined : index.items.get(parentId)
      if (parent?.type !== 'section') return undefined
      current = parent
      continue
    }
    if (last && !directoryUrl) {
      const doc = current.documents.find((d) => `${d.name}.md` === segment)
      if (doc) return doc
      const resource = current.resources.find((r) => r.name === segment)
      if (resource) return resource
    }
    const sub: SectionModel | undefined = current.subsections.find((s) => s.name === segment)
    if (sub) {
      current = sub
      continue
    }
    if (last && directoryUrl) return current.documents.find((d) => d.name === segment)
    return undefined
  }
  if (directoryUrl) return current.documents.find((d) => d.name === 'index') ?? current
  return current
}

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
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

  function resolve(fromSectionId: string, href: string): TreeItem | undefined {
    const from = section(fromSectionId)
    return from ? resolveRelative(index.value, from, href) : undefined
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
    uploadResource: (parentId: string, name: string, file: Blob) =>
      mutate(() => api().uploadResource(parentId, name, file)),
    renameResource: (id: string, name: string) => mutate(() => api().renameResource(id, name)),
    deleteResource: (id: string) => mutate(() => api().deleteResource(id)),
  }
})
