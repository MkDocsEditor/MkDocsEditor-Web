import { ref } from 'vue'

import type { TreeItem } from '@/api'
import type { useTreeStore } from '@/stores/tree'

/** The tree item being dragged in the navigation tree (drag and drop moves it). */
export const dragged = ref<TreeItem | null>(null)
/** The folder under the pointer that would accept the drop. */
export const dropTarget = ref<string | null>(null)

/** Whether `item` can be dropped into the section: not into itself, below itself or where it is. */
export function canDropInto(
  tree: ReturnType<typeof useTreeStore>,
  item: TreeItem | null,
  sectionId: string,
): item is TreeItem {
  if (!item || item.id === sectionId) return false
  if (tree.parentOf(item.id)?.id === sectionId) return false
  if (item.type === 'section' && tree.ancestors(sectionId).some((s) => s.id === item.id))
    return false
  return true
}
