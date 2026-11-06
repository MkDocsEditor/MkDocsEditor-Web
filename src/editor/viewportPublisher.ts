import type { EditorView } from '@codemirror/view'

import type { DocumentSession, TextRange } from '@/sync/session'

/** The text on screen, by character and not by line: a long paragraph is one line. */
export function visibleRange(view: EditorView): TextRange | null {
  const scroller = view.scrollDOM.getBoundingClientRect()
  if (scroller.height === 0) return null
  const content = view.contentDOM.getBoundingClientRect()
  return {
    top: view.posAtCoords({ x: content.left + 1, y: scroller.top + 1 }, false),
    bottom: view.posAtCoords({ x: content.right - 1, y: scroller.bottom - 1 }, false),
  }
}

/**
 * Tells the session what the editor shows, for those who follow this user. `publish` is for
 * whatever else changes it without a scroll: edits, a new size, the pane being shown. While the
 * editor is hidden it says nothing: the preview tells the session then.
 */
export function createViewportPublisher(
  view: EditorView,
  session: DocumentSession,
  shown: () => boolean = () => true,
) {
  let last: TextRange | null | undefined

  function publish(): void {
    if (!shown()) {
      // when it shows again, it tells its range even if that did not change
      last = undefined
      return
    }
    view.requestMeasure({
      key: 'viewport-publisher',
      read: visibleRange,
      write(range) {
        if (range?.top === last?.top && range?.bottom === last?.bottom && last !== undefined) return
        last = range
        session.setLocalViewport(range)
      },
    })
  }

  view.scrollDOM.addEventListener('scroll', publish, { passive: true })

  return {
    publish,
    destroy(): void {
      view.scrollDOM.removeEventListener('scroll', publish)
      session.setLocalViewport(null)
    },
  }
}
