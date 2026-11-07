import { defineStore } from 'pinia'
import { computed } from 'vue'

import type { ServerPageMeta, TreeItem } from '@/api'
import { emptyMeta, parseFrontMatter } from '@/markdown/frontMatter'
import type { PageMeta } from '@/markdown/frontMatter'
import { pageTitle, titleFromPath } from '@/markdown/pageTitle'
import { iconFor } from '@/services/icons'
import { materialIcon } from '@/services/materialIcons'

import { usePagesStore } from './pages'
import { useTreeStore } from './tree'

const EMPTY = Object.freeze(emptyMeta()) as PageMeta

function fromServer(meta: ServerPageMeta): PageMeta {
  return {
    ...emptyMeta(),
    title: meta.title ?? undefined,
    description: meta.description ?? undefined,
    icon: meta.icon ?? undefined,
    status: meta.status ?? undefined,
    tags: meta.tags ?? [],
    searchExclude: meta.searchExclude === true,
  }
}

/**
 * The front matter and names of all pages (title, description, icon, status, tags). A backend
 * with `page-meta` sends them with the tree; with an older one, they are read from the page texts
 * of `usePagesStore`, and pages without a stored text have only the name from their file.
 */
export const usePageMetaStore = defineStore('pageMeta', () => {
  const pages = usePagesStore()
  const tree = useTreeStore()
  /** Only pages whose text changed are read again. */
  let cache = new Map<string, { text: string; meta: PageMeta }>()

  const metas = computed(() => {
    const next = new Map<string, { text: string; meta: PageMeta }>()
    for (const [id, page] of pages.pages) {
      const known = cache.get(id)
      next.set(
        id,
        known?.text === page.text
          ? known
          : { text: page.text, meta: parseFrontMatter(page.text).meta },
      )
    }
    cache = next
    return next
  })

  /** Server meta converted once per tree item. */
  const serverMetas = new WeakMap<ServerPageMeta, PageMeta>()

  function meta(id: string): PageMeta {
    const item = tree.get(id)
    if (item?.type === 'document' && item.meta) {
      let known = serverMetas.get(item.meta)
      if (!known) serverMetas.set(item.meta, (known = fromServer(item.meta)))
      return known
    }
    return metas.value.get(id)?.meta ?? EMPTY
  }

  /** The name to show for an item: the MkDocs name of a page (see `pageTitle`), else its name. */
  function title(item: Pick<TreeItem, 'id' | 'name' | 'type'>): string {
    if (item.type !== 'document') return item.name
    const known = tree.get(item.id)
    if (known?.type === 'document' && known.title) return known.title
    const path = tree.path(item.id) || `${item.name}.md`
    const text = pages.pages.get(item.id)?.text
    return text === undefined ? titleFromPath(path) : pageTitle(text, path)
  }

  /** The icon of an item: the front matter icon of a page, else the icon of its type. */
  function icon(item: TreeItem): string {
    return (item.type === 'document' && materialIcon(meta(item.id).icon)) || iconFor(item)
  }

  return { meta, title, icon }
})
