import { defineStore } from 'pinia'
import { computed } from 'vue'

import type { TreeItem } from '@/api'
import { emptyMeta, parseFrontMatter } from '@/markdown/frontMatter'
import type { PageMeta } from '@/markdown/frontMatter'
import { iconFor } from '@/services/icons'
import { materialIcon } from '@/services/materialIcons'

import { usePagesStore } from './pages'

const EMPTY = Object.freeze(emptyMeta()) as PageMeta

/**
 * The front matter of all pages on this device (title, description, icon, status, tags), read
 * from the page texts of `usePagesStore`. Pages without a stored text have no meta data yet.
 */
export const usePageMetaStore = defineStore('pageMeta', () => {
  const pages = usePagesStore()
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

  function meta(id: string): PageMeta {
    return metas.value.get(id)?.meta ?? EMPTY
  }

  /** The name to show for an item: the title of a page, else its name. */
  function title(item: Pick<TreeItem, 'id' | 'name' | 'type'>): string {
    return (item.type === 'document' && meta(item.id).title) || item.name
  }

  /** The icon of an item: the front matter icon of a page, else the icon of its type. */
  function icon(item: TreeItem): string {
    return (item.type === 'document' && materialIcon(meta(item.id).icon)) || iconFor(item)
  }

  return { meta, title, icon }
})
