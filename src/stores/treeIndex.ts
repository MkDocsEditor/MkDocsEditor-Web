import type { DocumentModel, ResourceModel, SectionModel, TreeItem } from '@/api'
import { isExternalUrl } from '@/services/linkPath'
import type { LinkTarget } from '@/services/linkPath'

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

/** The file name of an item in the docs folder (documents get `.md`). */
function fileNameOf(item: TreeItem): string {
  return item.type === 'document' ? `${item.name}.md` : item.name
}

/**
 * Path of an item relative to the docs folder (`docs/references.md` section 1). Newer backends
 * send it; for older ones it is built from the names of the sections above.
 */
export function pathOf(index: TreeIndex, id: string): string {
  const item = index.items.get(id)
  if (!item) return ''
  if (item.path !== undefined) return item.path
  if (!index.parents.has(id)) return '' // the root section
  return [
    ...ancestorsOf(index, id)
      .slice(1)
      .map((s) => s.name),
    fileNameOf(item),
  ].join('/')
}

/** The index document of a section: `index.md`, else `README.md` (as MkDocs does). */
export function indexDocumentOf(section: SectionModel): DocumentModel | undefined {
  if (section.index !== undefined) return section.documents.find((d) => d.id === section.index)
  return (
    section.documents.find((d) => d.name === 'index') ??
    section.documents.find((d) => d.name === 'README')
  )
}

/** Input of the link path algorithm for an item. */
export function linkTargetOf(index: TreeIndex, item: TreeItem): LinkTarget {
  const path = pathOf(index, item.id)
  if (item.type !== 'section') return { type: item.type, path }
  const doc = indexDocumentOf(item)
  return { type: 'section', path, index: doc ? pathOf(index, doc.id) : '' }
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
  if (isExternalUrl(href) || href.startsWith('#')) return undefined
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
