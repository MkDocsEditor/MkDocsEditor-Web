import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { onBeforeUnmount, watch } from 'vue'

import type { ScrollAnchor } from '@/markdown/sourceLines'
import { recallView, rememberView } from '@/sync/viewMemory'

/**
 * A document opens where it was left on this device: the selection, and how far the editor and
 * the preview were scrolled. Once per opening, as soon as the text is in the editor, and only
 * if nothing else has placed the page first: a link to a line or a change, a join link,
 * following someone, or the user. Whatever places it later wins too, as it comes after.
 */
export function useViewMemory(options: {
  id: () => string
  view: () => EditorView | null
  text: () => string
  ready: () => boolean
  editorShown: () => boolean
  previewShown: () => boolean
  /** Split mode with synced scrolling: the preview goes along with the editor. */
  previewFollows: () => boolean
  scrollEditor: (anchor: ScrollAnchor) => void
  scrollPreview: (anchor: ScrollAnchor) => void
  /** The editor and the preview: input there places the page (not the toolbar, the mode, …). */
  panes: () => HTMLElement | null
}) {
  /** The document whose view is restored or not needed any more; records only then. */
  let settledId: string | null = null
  let editorAnchor: ScrollAnchor | undefined
  let previewAnchor: ScrollAnchor | undefined
  let oldView: EditorView | null = null

  function onInput(event: Event): void {
    const panes = options.panes()
    if (panes && event.target instanceof Node && panes.contains(event.target)) cancel()
  }

  function listen(on: boolean): void {
    for (const event of INTERACTIONS) {
      if (on) window.addEventListener(event, onInput, true)
      else window.removeEventListener(event, onInput, true)
    }
  }

  function settle(id: string): void {
    settledId = id
    listen(false)
  }

  /** Something else places the page: no restore for this opening. */
  function cancel(): void {
    if (settledId !== options.id()) settle(options.id())
  }

  /** Records the view of `id`, which the editor still shows. */
  function save(id = options.id()): void {
    const view = options.view()
    if (!view || settledId !== id) return
    const { ranges, mainIndex } = view.state.selection
    rememberView(id, {
      selection: ranges.map((r) => ({ anchor: r.anchor, head: r.head })),
      main: mainIndex,
      ...(editorAnchor ? { editor: editorAnchor } : {}),
      ...(previewAnchor ? { preview: previewAnchor } : {}),
      length: view.state.doc.length,
    })
  }

  // a new opening: what was recorded belongs to the one before
  watch(
    options.id,
    (_, before) => {
      if (before !== undefined) save(before)
      // the editor of the old document, until the new one is there
      oldView = before === undefined ? null : options.view()
      settledId = null
      editorAnchor = previewAnchor = undefined
      listen(true)
    },
    // before the editor of the old document goes away
    { flush: 'sync', immediate: true },
  )

  watch(
    () =>
      [
        options.id(),
        options.ready(),
        options.view(),
        options.view()?.state.doc.length === options.text().length,
      ] as const,
    ([id, ready, view, loaded]) => {
      if (settledId === id || !ready || !view || view === oldView || !loaded) return
      settle(id)
      const remembered = recallView(id, view.state.doc.length)
      if (!remembered) return
      editorAnchor = remembered.editor
      previewAnchor = remembered.preview
      view.dispatch({
        selection: EditorSelection.create(
          remembered.selection.map((r) => EditorSelection.range(r.anchor, r.head)),
          remembered.main,
        ),
      })
      if (options.editorShown() && editorAnchor) options.scrollEditor(editorAnchor)
      if (options.previewShown() && previewAnchor && !options.previewFollows())
        options.scrollPreview(previewAnchor)
    },
    { flush: 'post', immediate: true },
  )

  function onPageHidden(): void {
    if (document.visibilityState === 'hidden') save()
  }
  document.addEventListener('visibilitychange', onPageHidden)
  const onPageHide = () => save()
  window.addEventListener('pagehide', onPageHide)
  onBeforeUnmount(() => {
    save()
    listen(false)
    document.removeEventListener('visibilitychange', onPageHidden)
    window.removeEventListener('pagehide', onPageHide)
  })

  return {
    cancel,
    /** The editor's reading place after a scroll; only while it is on screen. */
    onEditorAnchor(anchor: ScrollAnchor): void {
      if (settledId === options.id() && options.editorShown()) editorAnchor = anchor
    },
    /** The preview's reading place after a scroll; only while it is on screen. */
    onPreviewAnchor(anchor: ScrollAnchor): void {
      if (settledId === options.id() && options.previewShown()) previewAnchor = anchor
    },
  }
}

const INTERACTIONS = ['keydown', 'pointerdown', 'wheel'] as const
