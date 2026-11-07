import type { AuthorHighlightMode } from '@/editor/authorship'

import { useStored } from './useStored'

/**
 * Settings of this browser, shown under Settings. One ref each for the whole app, so that a
 * change on the settings page reaches every place that uses it at once.
 */

export type StartPage = 'dashboard' | 'files'
export type ThemeChoice = 'system' | 'light' | 'dark'

/** What `/` shows: "What's going on" (the default) or the files of the top folder. */
export const startPage = useStored<StartPage>('mkdocseditor.startPage', 'dashboard')

/** Light, dark, or like the system. */
export const themeChoice = useStored<ThemeChoice>('mkdocseditor.theme', 'system')

/** Files (resources) in the navigation tree; can be hidden in large wikis. */
export const showFilesInTree = useStored('mkdocseditor.treeShowFiles', true)

/** Who wrote what, in the editor. */
export const authorHighlight = useStored<AuthorHighlightMode>(
  'mkdocseditor.authorHighlight',
  'marker',
)

/** Line numbers next to the text, on wide screens (phones never have room for them). */
export const lineNumbers = useStored('mkdocseditor.lineNumbers', true)

/** In split view, scrolling one pane scrolls the other along. Off, both move on their own. */
export const syncScroll = useStored('mkdocseditor.syncScroll', true)
