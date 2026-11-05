import type { EditorView } from '@codemirror/view'

/** The scroll of each view that is still running; a newer one replaces it. */
const running = new WeakMap<EditorView, symbol>()

/**
 * Scrolls `position` to the middle of the editor in one smooth movement, not in a jump. Lines far
 * away only have estimated heights until they are drawn, so it checks the place once it arrived.
 */
export function scrollToCenter(view: EditorView, position: number): void {
  const scroller = view.scrollDOM
  const token = Symbol()
  running.set(view, token)
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  scroller.scrollTo?.({ top: targetTop(view, position), behavior: reduced ? 'auto' : 'smooth' })
  scroller.addEventListener(
    'scrollend',
    () => {
      if (running.get(view) !== token) return
      running.delete(view)
      const top = targetTop(view, position)
      if (Math.abs(top - scroller.scrollTop) > 4) scroller.scrollTo?.({ top, behavior: 'auto' })
    },
    { once: true },
  )
}

function targetTop(view: EditorView, position: number): number {
  const scroller = view.scrollDOM
  const block = view.lineBlockAt(Math.min(position, view.state.doc.length))
  // where the document starts, in the coordinates of the scroll position
  const origin = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop
  const top = origin + block.top + block.height / 2 - scroller.clientHeight / 2
  return Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight))
}
