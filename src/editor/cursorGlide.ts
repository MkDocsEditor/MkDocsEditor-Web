import { ViewPlugin } from '@codemirror/view'
import type { EditorView, ViewUpdate } from '@codemirror/view'

import { fadesText } from './appearance'

/**
 * Remote cursors (and their name flags) glide to a new place instead of jumping: an ease-out
 * over `GLIDE_MS`, by `transform` only. A move that comes while one is under way starts from
 * where the cursor is drawn then, so an agent typing makes it follow the text continuously.
 *
 * It glides when it stays on its visual line and moves at most `MAX_WIDTH` of the text's
 * width, or when it moves one line up or down and at most `MAX_SIDEWAYS` line heights sideways.
 * Else it snaps: a jump elsewhere, a wrap or a new line (to the start of the next line), and also
 * when only the layout changed (resize, fonts), when it moved less than half a pixel, when
 * "Animate edits of others" is off, when the system reduces motion and while the page is hidden.
 *
 * A cursor that appears just appears. The own cursor is CodeMirror's and never glides.
 */
export const GLIDE_MS = 120
export const MAX_WIDTH = 0.4
export const MAX_SIDEWAYS = 3

/** Ease-out cubic: fast start, gentle stop. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3

interface Glide {
  fromX: number
  fromY: number
  toX: number
  toY: number
  start: number
}

/** Where a glide draws the cursor at `time`. */
export function glidePosition(glide: Glide, time: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, (time - glide.start) / GLIDE_MS))
  const k = easeOut(t)
  return {
    x: glide.fromX + (glide.toX - glide.fromX) * k,
    y: glide.fromY + (glide.toY - glide.fromY) * k,
  }
}

/** Whether a move from `from` to `to` glides; see the rules above. */
export function glides(
  from: { x: number; y: number },
  to: { x: number; y: number },
  lineHeight: number,
  width: number,
): boolean {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  if (dx < 0.5 && dy < 0.5) return false
  if (dy < lineHeight / 2) return dx <= MAX_WIDTH * width
  return dy < lineHeight * 1.5 && dx <= MAX_SIDEWAYS * lineHeight
}

const CARET = '.cm-remote-caret[data-peer]'

class CursorGlider {
  private glides = new Map<string, Glide>()
  private frame = 0

  constructor(private readonly view: EditorView) {
    this.schedule(false)
  }

  update(update: ViewUpdate): void {
    // moved with the text or by a new place of the peer, or only laid out anew
    const moved = update.docChanged || update.transactions.some((tr) => tr.effects.length > 0)
    if (moved || update.geometryChanged || update.viewportChanged) this.schedule(moved)
  }

  private schedule(moved: boolean): void {
    this.view.requestMeasure({
      read: () => this.read(moved),
      write: () => this.draw(),
    })
  }

  private animated(): boolean {
    return fadesText(this.view.state) && document.visibilityState !== 'hidden'
  }

  private read(moved: boolean): void {
    const now = performance.now()
    const animate = moved && this.animated()
    const lineHeight = this.view.defaultLineHeight
    const width = this.view.contentDOM.clientWidth
    const origin = this.view.contentDOM.getBoundingClientRect()
    const next = new Map<string, Glide>()
    for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
      const key = caret.dataset.peer!
      // in the text, so that scrolling moves nothing; without the shift of a glide under way
      const box = caret.getBoundingClientRect()
      const to = {
        x: box.left - origin.left - Number(caret.dataset.dx ?? 0),
        y: box.top - origin.top - Number(caret.dataset.dy ?? 0),
      }
      const before = this.glides.get(key)
      const shown = before && glidePosition(before, now)
      const glide = animate && shown && glides(shown, to, lineHeight, width)
      next.set(
        key,
        glide
          ? { fromX: shown.x, fromY: shown.y, toX: to.x, toY: to.y, start: now }
          : { fromX: to.x, fromY: to.y, toX: to.x, toY: to.y, start: now },
      )
    }
    this.glides = next
  }

  private draw(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    const now = performance.now()
    let running = false
    for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
      const glide = this.glides.get(caret.dataset.peer!)
      const at = glide && glidePosition(glide, now)
      const still = glide && glide.fromX === glide.toX && glide.fromY === glide.toY
      if (!glide || !at || still || now - glide.start >= GLIDE_MS) {
        caret.style.transform = ''
        delete caret.dataset.dx
        delete caret.dataset.dy
        continue
      }
      running = true
      const dx = at.x - glide.toX
      const dy = at.y - glide.toY
      caret.style.transform = `translate(${dx}px, ${dy}px)`
      caret.dataset.dx = String(dx)
      caret.dataset.dy = String(dy)
    }
    if (running) this.frame = requestAnimationFrame(() => this.draw())
  }

  destroy(): void {
    cancelAnimationFrame(this.frame)
  }
}

/** Lets the cursors of `remoteCursors` glide. */
export const cursorGlide = ViewPlugin.fromClass(CursorGlider)
