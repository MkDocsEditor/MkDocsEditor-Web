import { EditorView, ViewPlugin } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'

import { fadesText } from './appearance'
import { GONE, remoteSelections } from './remoteCursors'

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
 * A cursor that appears just appears. One that goes away (its user left, or an agent took its
 * pointer away) fades out over `FADE_OUT_MS`, linearly, under the same settings; if it comes
 * back meanwhile it shows in full at once. The own cursor is CodeMirror's and never glides.
 */
export const GLIDE_MS = 120
export const FADE_OUT_MS = 200
export const MAX_WIDTH = 0.4
export const MAX_SIDEWAYS = 3

/** Ease-out cubic: fast start, gentle stop. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3

export interface Glide {
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

/**
 * The glide to a new place `to`: on from where `before` draws it now, or a snap. The same target
 * keeps the glide under way, so that updates of anything else do not start it anew.
 */
export function retarget(
  before: Glide | undefined,
  to: { x: number; y: number },
  now: number,
  animate: boolean,
  lineHeight: number,
  width: number,
): Glide {
  if (before && Math.abs(before.toX - to.x) < 0.5 && Math.abs(before.toY - to.y) < 0.5)
    return before
  const shown = before && glidePosition(before, now)
  if (animate && shown && glides(shown, to, lineHeight, width))
    return { fromX: shown.x, fromY: shown.y, toX: to.x, toY: to.y, start: now }
  return { fromX: to.x, fromY: to.y, toX: to.x, toY: to.y, start: now }
}

/** A glide to `to` from where `before` draws it now, however far; a snap without `before`. */
export function glideTo(
  before: Glide | undefined,
  to: { x: number; y: number },
  now: number,
): Glide {
  if (before && Math.abs(before.toX - to.x) < 0.5 && Math.abs(before.toY - to.y) < 0.5)
    return before
  const shown = before ? glidePosition(before, now) : to
  return { fromX: shown.x, fromY: shown.y, toX: to.x, toY: to.y, start: now }
}

/** Whether a glide still moves at `time`. */
export function moving(glide: Glide, time: number): boolean {
  return (glide.fromX !== glide.toX || glide.fromY !== glide.toY) && time - glide.start < GLIDE_MS
}

/** Whether "Animate edits of others" applies now: on, no reduced motion, the page visible. */
export function animates(view: EditorView): boolean {
  return fadesText(view.state) && document.visibilityState !== 'hidden'
}

const CARET = '.cm-remote-caret[data-peer]'

/** A caret as it was last drawn, in the scrolled content, to fade it out when it goes. */
interface Drawn {
  caret: HTMLElement
  x: number
  y: number
}

class CursorGlider {
  private glides = new Map<string, Glide>()
  private drawn = new Map<string, Drawn>()
  private leaving: (Drawn & { key: string })[] = []
  /** The fading copies, by caret; one whose caret comes back goes at once. */
  private copies = new Map<string, HTMLElement>()
  private returning: string[] = []
  private frame = 0
  /** Carets that went away, while they fade out. */
  private readonly fading: HTMLElement

  constructor(private readonly view: EditorView) {
    this.fading = view.scrollDOM.appendChild(document.createElement('div'))
    this.fading.className = 'cm-layer cm-remoteCaretFadeLayer'
    this.fading.setAttribute('aria-hidden', 'true')
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

  private read(moved: boolean): void {
    const now = performance.now()
    const animate = moved && animates(this.view)
    const lineHeight = this.view.defaultLineHeight
    const width = this.view.contentDOM.clientWidth
    const origin = this.view.contentDOM.getBoundingClientRect()
    const scroller = this.view.scrollDOM.getBoundingClientRect()
    const baseX = scroller.left - this.view.scrollDOM.scrollLeft
    const baseY = scroller.top - this.view.scrollDOM.scrollTop
    // gone from the state, not only scrolled out of what CodeMirror draws
    const present = new Set(this.view.state.field(remoteSelections).map((s) => s.key))
    if (animates(this.view))
      for (const [key, drawn] of this.drawn)
        if (!present.has(key)) this.leaving.push({ ...drawn, key })
    for (const key of this.copies.keys()) if (present.has(key)) this.returning.push(key)
    const next = new Map<string, Glide>()
    const drawn = new Map<string, Drawn>()
    for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
      const key = caret.dataset.peer!
      // in the text, so that scrolling moves nothing; without the shift of a glide under way
      const box = caret.getBoundingClientRect()
      const dx = Number(caret.dataset.dx ?? 0)
      const dy = Number(caret.dataset.dy ?? 0)
      const to = { x: box.left - origin.left - dx, y: box.top - origin.top - dy }
      next.set(key, retarget(this.glides.get(key), to, now, animate, lineHeight, width))
      drawn.set(key, { caret, x: box.left - baseX, y: box.top - baseY })
    }
    // carets scrolled out of view keep their last place, should they go away there
    for (const [key, last] of this.drawn)
      if (present.has(key) && !drawn.has(key)) drawn.set(key, last)
    this.glides = next
    this.drawn = drawn
  }

  /** A copy of each caret that went away, where it was drawn, fading out. */
  private fadeOut(): void {
    for (const key of this.returning) {
      this.copies.get(key)?.remove()
      this.copies.delete(key)
    }
    this.returning = []
    for (const { caret, x, y, key } of this.leaving) {
      const copy = caret.cloneNode(true) as HTMLElement
      // no caret any more, for whoever looks for carets; the same styles
      for (const el of [copy, ...copy.querySelectorAll<HTMLElement>('*')])
        el.className = el.className.replace(/cm-remote-caret/g, GONE)
      delete copy.dataset.peer
      copy.style.transform = ''
      copy.style.position = 'absolute'
      copy.style.left = `${x}px`
      copy.style.top = `${y}px`
      this.copies.get(key)?.remove()
      this.copies.set(key, copy)
      this.fading.appendChild(copy)
      // faint for a ghost: the copy has its classes
      const from = getComputedStyle(copy).opacity || '1'
      copy
        .animate([{ opacity: from }, { opacity: 0 }], {
          duration: FADE_OUT_MS,
          easing: 'linear',
          fill: 'forwards',
        })
        .finished.catch(() => undefined)
        .then(() => {
          copy.remove()
          if (this.copies.get(key) === copy) this.copies.delete(key)
        })
    }
    this.leaving = []
  }

  private draw(): void {
    this.fadeOut()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    const now = performance.now()
    let running = false
    for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
      const glide = this.glides.get(caret.dataset.peer!)
      if (!glide || !moving(glide, now)) {
        caret.style.transform = ''
        delete caret.dataset.dx
        delete caret.dataset.dy
        continue
      }
      running = true
      const at = glidePosition(glide, now)
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
    this.fading.remove()
  }
}

/** Lets the cursors of `remoteCursors` glide, and fade out when they go. */
export const cursorGlide = [
  ViewPlugin.fromClass(CursorGlider),
  EditorView.baseTheme({
    // with the flags of the carets that stay
    '.cm-remoteCaretFadeLayer': { zIndex: '10', pointerEvents: 'none' },
  }),
]
