import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { TreeItem } from '@/api'

/** The move dialog, opened from the tree (drag and drop, menus), folder lists and item pages. */
export const useMoveStore = defineStore('move', () => {
  const item = ref<TreeItem | null>(null)
  /** Preselected target folder (a drop target), else the item's folder. */
  const target = ref<string | null>(null)
  /** Only the name changes: the dialog has no folder picker. */
  const renameOnly = ref(false)

  function open(what: TreeItem, into: string | null = null): void {
    item.value = what
    target.value = into
    renameOnly.value = false
  }

  /** The same dialog for a new name; it updates the links like a move. */
  function rename(what: TreeItem): void {
    open(what)
    renameOnly.value = true
  }

  function close(): void {
    item.value = null
    target.value = null
  }

  return { item, target, renameOnly, open, rename, close }
})
