import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { TreeItem } from '@/api'

/**
 * Deleting a folder, page or file, from wherever it is offered: the tree, folder lists and the
 * pages of the items. The dialogs live once in the app shell. Rename and move go through the move
 * dialog (`move`), which updates the links.
 */
export const useItemActionsStore = defineStore('itemActions', () => {
  const deleting = ref<TreeItem | null>(null)
  return { deleting, remove: (item: TreeItem) => void (deleting.value = item) }
})
