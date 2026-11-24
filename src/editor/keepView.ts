import { EditorView, ViewPlugin } from '@codemirror/view'
import type { PluginValue, ViewUpdate } from '@codemirror/view'

import { isRevealStep, remoteChange } from './appearance'
import { setPeers } from './remoteCursors'

/**
 * The view stays where the person here looks while others change the text above it (KodeEditor's
 * rule of the view anchor). CodeMirror's own scroll anchoring misses changes that move its
 * viewport, which is any change of lines above what is shown.
 *
 * - Right before a change of others, take an anchor from the layout as it is still drawn: the own
 *   caret, if the editor has focus and it is in view, else the first line in view.
 * - If the change ends at or before the anchor, scroll by how far it moved the anchor once the
 *   change is drawn, before it is painted: vertically always, sideways only without wrapping.
 *   Measured in the layout, not by counting characters.
 * - The anchor is then held, every frame, until `HOLD_MS` after the last update of others (text
 *   or cursors), as their text grows or its gap closes (`appearance`) and wraps anew on the way,
 *   and their cursors move: whatever moves it, the view follows, unless the person scrolls, edits
 *   or moves the caret meanwhile, or a change covers the anchor.
 * - A change behind the anchor moves nothing, nor does the own editing. The scroll stops at the
 *   ends of the document by itself.
 */
const HOLD_MS = 400

interface Anchor {
  /** In the document after the change. */
  pos: number
  /** Where it was on the screen. */
  top: number
  left: number
  /** The own caret: sideways too, without wrapping. */
  caret: boolean
  /** Where it is in the document, to see whether a change covers it. */
  before: number
}

/** The own caret if it is in view, from the DOM selection as drawn before the change. */
function caretBefore(
  view: EditorView,
  top: number,
  bottom: number,
): Omit<Anchor, 'pos' | 'before'> | null {
  if (!view.hasFocus) return null
  const selection = view.root instanceof Document ? view.root.getSelection() : getSelection()
  if (!selection?.focusNode || !view.contentDOM.contains(selection.focusNode)) return null
  const range = document.createRange()
  range.setStart(selection.focusNode, selection.focusOffset)
  const box =
    range.getClientRects()[0] ?? (selection.focusNode as Element).getBoundingClientRect?.()
  if (!box || box.bottom <= top || box.top >= bottom) return null
  return { top: box.top, left: box.left, caret: true }
}

/** The box of the drawn line at `pos`, measured as the anchor was taken: not its text. */
function lineBox(view: EditorView, pos: number): { top: number; left: number } | null {
  const { from, to } = view.viewport
  if (pos < from || pos > to) return null
  const { node } = view.domAtPos(pos)
  const line = (node instanceof Element ? node : node.parentElement)?.closest('.cm-line')
  return line ? line.getBoundingClientRect() : null
}

class ViewKeeper implements PluginValue {
  private anchor: Anchor | null = null
  private until = 0
  private scrollTop = 0
  private frame = 0

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate): void {
    if (update.transactions.length === 0) return
    // the own editing or a move of the own caret: CodeMirror keeps the caret in view
    const own = update.transactions.some(
      (tr) => !tr.annotation(remoteChange) && (tr.docChanged || tr.selection),
    )
    if (own) return this.release()
    // only what others do moves the text: their changes, their cursors, the steps of a reveal;
    // a scroll asked for here (the preview, following, a jump) is left alone
    const others = update.transactions.every(
      (tr) =>
        tr.annotation(remoteChange) || tr.effects.some((e) => e.is(setPeers)) || isRevealStep(tr),
    )
    if (!others) return this.release()
    const { view } = this
    if (this.anchor) {
      // held: it goes along with the text, and stays where it was on the screen
      const held = this.anchor
      let covered = false
      update.changes.iterChangedRanges((fromA, toA) => {
        if (fromA < held.before && toA > held.before) covered = true
      })
      if (covered) this.release()
      else
        this.anchor = {
          ...held,
          pos: held.caret ? update.state.selection.main.head : update.changes.mapPos(held.pos, 1),
          before: update.changes.mapPos(held.before, 1),
        }
    }
    if (!this.anchor) {
      const anchor = this.take(update)
      if (!anchor) return
      // only changes up to the anchor move it; one behind it moves nothing
      let ahead = true
      update.changes.iterChangedRanges((_fromA, toA) => {
        if (toA > anchor.old) ahead = false
      })
      if (!ahead) return
      this.anchor = { ...anchor, before: anchor.pos }
      this.scrollTop = view.scrollDOM.scrollTop
    }
    this.until = performance.now() + HOLD_MS
    // drawn, and not yet painted
    queueMicrotask(() => this.hold())
  }

  /** The anchor in the layout as it is still drawn, before `update`. */
  private take(update: ViewUpdate): (Omit<Anchor, 'before'> & { old: number }) | null {
    const { view } = this
    const scroller = view.scrollDOM.getBoundingClientRect()
    const caret = caretBefore(view, scroller.top, scroller.bottom)
    if (caret)
      return {
        ...caret,
        old: update.startState.selection.main.head,
        pos: update.state.selection.main.head,
      }
    // lines only: not the placeholders of what CodeMirror does not draw
    const line = [...view.contentDOM.querySelectorAll(':scope > .cm-line')].find(
      (el) => el.getBoundingClientRect().bottom > scroller.top,
    )
    if (!line) return null
    const box = line.getBoundingClientRect()
    const old = view.posAtDOM(line, 0)
    return { old, pos: update.changes.mapPos(old, 1), top: box.top, left: box.left, caret: false }
  }

  /** Scrolls the anchor back to where it was; on every frame while it is held. */
  private hold(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    const { view, anchor } = this
    if (!anchor) return
    const scroller = view.scrollDOM
    // the person scrolled: they look elsewhere now
    if (Math.abs(scroller.scrollTop - this.scrollTop) > 1) return this.release()
    const coords = anchor.caret ? view.coordsAtPos(anchor.pos, -1) : lineBox(view, anchor.pos)
    if (coords) {
      const dy = coords.top - anchor.top
      if (Math.abs(dy) > 0.5) scroller.scrollTop += dy
      if (anchor.caret && !view.lineWrapping) {
        const dx = coords.left - anchor.left
        if (Math.abs(dx) > 0.5) scroller.scrollLeft += dx
      }
      this.scrollTop = scroller.scrollTop
    }
    if (performance.now() < this.until) this.frame = requestAnimationFrame(() => this.hold())
    else this.release()
  }

  private release(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.anchor = null
  }

  destroy(): void {
    this.release()
  }
}

/** Keeps the view where the person looks while others change the text above it. */
export const keepView = ViewPlugin.fromClass(ViewKeeper)
