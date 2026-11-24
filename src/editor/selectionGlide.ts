import { EditorView, ViewPlugin } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'

import {
  FADE_OUT_MS,
  animates,
  glidePosition,
  glideTo,
  glides,
  moving,
  retarget,
} from './cursorGlide'
import type { Glide } from './cursorGlide'
import { frameNow } from './appearance'
import { remoteSelections } from './remoteCursors'

/**
 * Draws the selections of others as rectangles from their start to their end, like CodeMirror's
 * own selection, over the text and blended so that only its background takes the colour. Both ends glide like the carets (`cursorGlide`: the same
 * time and curve), so a caret that starts selecting grows a selection, one that moves glides at
 * both ends, and one that ends shrinks into the caret. The caret's move decides, with the rules
 * of `cursorGlide`: when it glides, the other end glides along however far; when it snaps (a
 * far selection), the whole selection jumps. A selection whose user leaves, or whose agent takes
 * its pointer away, fades out with the caret, linearly; back meanwhile, it shows in full.
 */

/** One end of a selection, in the scrolled content of the editor. */
interface End {
  glide: Glide
  /** Height of the row of text it is in. */
  height: number
}

interface Shown {
  color: string
  from: End
  to: End
  /** When it began to fade out: it went away. */
  fadeStart?: number
}

/** The rectangles of a selection from `a` to `b`, on rows from `left` to `right`. */
export function selectionRects(
  a: { x: number; y: number; height: number },
  b: { x: number; y: number; height: number },
  left: number,
  right: number,
): { left: number; top: number; width: number; height: number }[] {
  // during a glide the ends can pass each other
  const [start, end] =
    a.y > b.y + a.height / 2 || (Math.abs(a.y - b.y) < a.height / 2 && a.x > b.x) ? [b, a] : [a, b]
  if (Math.abs(start.y - end.y) < start.height / 2) {
    const width = end.x - start.x
    return width < 0.5 ? [] : [{ left: start.x, top: start.y, width, height: start.height }]
  }
  const rects = [
    { left: start.x, top: start.y, width: Math.max(0, right - start.x), height: start.height },
  ]
  const between = end.y - (start.y + start.height)
  if (between > 0.5)
    rects.push({ left, top: start.y + start.height, width: right - left, height: between })
  if (end.x - left >= 0.5) rects.push({ left, top: end.y, width: end.x - left, height: end.height })
  return rects
}

class SelectionGlider {
  private readonly dom: HTMLElement
  private shown = new Map<string, Shown>()
  private left = 0
  private right = 0
  private frame = 0

  constructor(private readonly view: EditorView) {
    this.dom = view.scrollDOM.appendChild(document.createElement('div'))
    // CodeMirror's layer style: out of the flow, its boxes placed in the scrolled content
    this.dom.className = 'cm-layer cm-remoteSelectionLayer'
    this.dom.setAttribute('aria-hidden', 'true')
    this.schedule(false)
  }

  update(update: ViewUpdate): void {
    const moved = update.docChanged || update.transactions.some((tr) => tr.effects.length > 0)
    if (moved || update.geometryChanged || update.viewportChanged) this.schedule(moved)
  }

  private schedule(moved: boolean): void {
    this.view.requestMeasure({ read: () => this.read(moved), write: () => this.draw() })
  }

  private read(moved: boolean): void {
    const { view } = this
    const now = frameNow()
    const animate = moved && animates(view)
    const lineHeight = view.defaultLineHeight
    const width = view.contentDOM.clientWidth
    // the scrolled content: scrolling moves nothing in it
    const scroller = view.scrollDOM.getBoundingClientRect()
    const baseX = scroller.left - view.scrollDOM.scrollLeft
    const baseY = scroller.top - view.scrollDOM.scrollTop
    const line = view.contentDOM.querySelector<HTMLElement>('.cm-line')
    if (line) {
      const box = line.getBoundingClientRect()
      const style = getComputedStyle(line)
      this.left = box.left - baseX + parseFloat(style.paddingLeft)
      this.right = box.right - baseX - parseFloat(style.paddingRight)
    }
    const { from: shownFrom, to: shownTo } = view.viewport
    const selections = view.state.field(remoteSelections)
    const next = new Map<string, Shown>()
    // gone from the state, not only scrolled out of what CodeMirror draws: fade out
    const present = new Set(selections.map((s) => s.key))
    if (animates(view))
      for (const [key, shown] of this.shown)
        if (!present.has(key) && now - (shown.fadeStart ?? now) < FADE_OUT_MS)
          next.set(key, { ...shown, fadeStart: shown.fadeStart ?? now })
    for (const selection of selections) {
      // only the part on screen: CodeMirror knows no places outside it
      const from = Math.min(Math.max(selection.from, shownFrom), shownTo)
      const to = Math.min(Math.max(selection.to, shownFrom), shownTo)
      if (to === from && selection.to > selection.from) continue
      const start = view.coordsAtPos(from, 1)
      const end = from === to ? start : view.coordsAtPos(to, -1)
      if (!start || !end) continue
      const at = (coords: { left: number; top: number }) => ({
        x: coords.left - baseX,
        y: coords.top - baseY,
      })
      const before = this.shown.get(selection.key)
      // the caret decides, as on Android: near, both ends glide (the other one however far); far,
      // the whole selection jumps
      const headIsTo = selection.head === selection.to && selection.to > selection.from
      const caretBefore = headIsTo ? before?.to : before?.from
      const caretTo = at(headIsTo ? end : start)
      const shownCaret = caretBefore && glidePosition(caretBefore.glide, now)
      const glide =
        animate &&
        !before?.fadeStart &&
        !!shownCaret &&
        (Math.abs(shownCaret.x - caretTo.x) < 0.5 && Math.abs(shownCaret.y - caretTo.y) < 0.5
          ? true
          : glides(shownCaret, caretTo, lineHeight, width))
      const place = (end: End | undefined, to: { x: number; y: number }) =>
        glide
          ? glideTo(end?.glide, to, now)
          : retarget(end?.glide, to, now, false, lineHeight, width)
      next.set(selection.key, {
        color: selection.color,
        from: { glide: place(before?.from, at(start)), height: start.bottom - start.top },
        to: { glide: place(before?.to, at(end)), height: end.bottom - end.top },
      })
    }
    this.shown = next
  }

  private draw(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    const now = frameNow()
    const boxes: HTMLElement[] = []
    let running = false
    for (const [key, { color, from, to, fadeStart }] of this.shown) {
      let opacity = 1
      if (fadeStart !== undefined) {
        const t = (now - fadeStart) / FADE_OUT_MS
        if (t >= 1) {
          this.shown.delete(key)
          continue
        }
        opacity = 1 - t
        running = true
      }
      running ||= moving(from.glide, now) || moving(to.glide, now)
      const a = { ...glidePosition(from.glide, now), height: from.height }
      const b = { ...glidePosition(to.glide, now), height: to.height }
      for (const rect of selectionRects(a, b, this.left, this.right)) {
        const box = document.createElement('div')
        box.className = 'cm-remote-selection'
        box.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background-color:${color};opacity:${opacity}`
        boxes.push(box)
      }
    }
    this.dom.replaceChildren(...boxes)
    if (running) this.frame = requestAnimationFrame(() => this.draw())
  }

  destroy(): void {
    cancelAnimationFrame(this.frame)
    this.dom.remove()
  }
}

/** Draws the selections of `remoteSelections`, gliding. */
export const selectionGlide = [
  ViewPlugin.fromClass(SelectionGlider),
  EditorView.baseTheme({
    // over the text, as lines have backgrounds of their own (the active line, code blocks),
    // and blended so that it tints what is behind the text and not the text: darker on light,
    // lighter on dark; under the name flags
    '.cm-remoteSelectionLayer': { zIndex: '1', mixBlendMode: 'multiply', pointerEvents: 'none' },
    '.v-theme--dark & .cm-remoteSelectionLayer': { mixBlendMode: 'screen' },
  }),
]
