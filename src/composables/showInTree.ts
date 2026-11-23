import { shallowRef } from 'vue'

/**
 * "Show in tree": the drawer opens, the folders down to the item expand, and its row scrolls
 * into view and gets the focus. The app shell carries out the request.
 */
export const showInTreeRequest = shallowRef<{ id: string } | null>(null)

/** The shortcut, in the notation of `shortcutLabel`. */
export const SHOW_IN_TREE_KEY = 'Alt-Shift-l'

export function showInTree(id: string): void {
  // a new object, so that asking again for the same item works too
  showInTreeRequest.value = { id }
}

/** Whether a key press is the shortcut; by the key's place, as Alt changes the character. */
export function isShowInTreeKey(event: KeyboardEvent): boolean {
  return event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyL'
}
