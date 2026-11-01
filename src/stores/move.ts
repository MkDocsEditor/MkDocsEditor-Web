import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { TreeItem } from '@/api'

/** The move dialog, opened from the tree (drag and drop), folder lists and item pages. */
export const useMoveStore = defineStore('move', () => {
  const item = ref<TreeItem | null>(null)
  /** Preselected target folder (a drop target), else the item's folder. */
  const target = ref<string | null>(null)

  function open(what: TreeItem, into: string | null = null): void {
    item.value = what
    target.value = into
  }

  function close(): void {
    item.value = null
    target.value = null
  }

  return { item, target, open, close }
})
