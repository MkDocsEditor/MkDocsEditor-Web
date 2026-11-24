import { EditorView, ViewPlugin } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'

import { appearingSpans, fadesText, frameNow, growsUpTo } from './appearance'
import {
  TYPING_CHARS,
  TYPING_WITHIN_MS,
  smoothInterval,
  typingSpeed,
  typingStep,
  typingWay,
} from './typingTiming'
import { LabelMotion } from './labelMotion'
import { WrapCarries } from './wrapCarry'
import type { Carried } from './wrapCarry'
import type { Box } from './labelMotion'
import { GHOST_OPACITY, GONE, remoteSelections, setPeers } from './remoteCursors'

/**
 * Remote cursors (and their name flags) glide to a new place instead of jumping: an ease-out
 * over `GLIDE_MS`, by `transform` only. A move that comes while one is under way starts from
 * where the cursor is drawn then, so an agent typing makes it follow the text continuously.
 *
 * It glides when it stays on its visual line and moves at most `MAX_WIDTH` of the text's
 * width, or when it moves one line up or down and at most `MAX_SIDEWAYS` line heights sideways.
 * Else it snaps: a jump elsewhere, a wrap or a new line (to the start of the next line; at the head
 * of a reveal these are carried instead, `wrapCarry`, R8), and also
 * when only the layout changed (resize, fonts), when it moved less than half a pixel, when
 * "Animate edits of others" is off, when the system reduces motion and while the page is hidden.
 *
 * The rules of KodeEditor (docs/reveal.md, R5), so that web and Android match. A cursor at rest
 * glides with the cubic ease-out. One that gets a new place while it glides (the head of a reveal,
 * fast typing) starts a new glide from where it is drawn and keeps its speed: a cubic Hermite
 * curve that stops at its place, with the speed it has, toward the new place only, and at most
 * the start speed of the ease-out, so it never shoots past or swings sideways. That glide catches
 * up: it takes 1.5 times the time since the place before, between `MIN_CATCH_UP_MS` and
 * `GLIDE_MS`. So does one within `CATCH_UP_WITHIN_MS` after a glide ended (steps come unevenly):
 * from a glide that ended at most `CONTINUE_MS` ago it starts in this frame, else one frame back,
 * so that it moves in its first frame. One move alone still takes `GLIDE_MS`.
 *
 * Typing (R5b, R5c): a step of at most `TYPING_CHARS` characters in its row, at most
 * `TYPING_WITHIN_MS` after the place before, glides from where the cursor is drawn with the timing
 * of `typingTiming`: for fast keys at an even speed, for 1.5 times the time between the steps
 * (smoothed), and a frame early, so it moves in the frame it is drawn first; for slow keys a short
 * ease-out step; in between a blend. So the cursor of somebody who types fast keeps moving between
 * their keys instead of starting fast and stopping at each ("pumping"). At the head of a reveal it
 * is a short glide.
 *
 * A caret right behind text of others that grows its space (`appearance`, R6b) does not glide: the
 * layout carries it at the moving edge, so the text behind it moves exactly with it.
 *
 * Nothing shows ahead of a caret (R7): text that fades in and ends at its place (pieces one behind
 * the other, and pieces right behind it, whose cursor may come a frame later) is drawn only left
 * of where the caret is drawn in its row, and not in later rows. So a character of a reveal shows
 * when the caret passes it, also while the caret lags behind the head. The cut reaches half a line
 * further than the text, so the part of a letter beyond its place is cut too.
 *
 * A cursor that appears fades in over `FADE_OUT_MS`, one that goes away (its user left, or an
 * agent took its pointer away) fades out in the same time, linearly, under the same settings; one
 * that comes back meanwhile fades in from where it is. The own cursor is CodeMirror's and never
 * glides.
 *
 * The label with the name sits at the first cursor of each user and stays calm while they write
 * fast (R9, `labelMotion`): above the cursor, below it on the first row and at the start of a row
 * that continues a wrapped line, inside the right edge of what is visible.
 */
export const GLIDE_MS = 120
export const FADE_OUT_MS = 200
export const MAX_WIDTH = 0.4
export const MAX_SIDEWAYS = 3
export const MIN_CATCH_UP_MS = 32
export const CATCH_UP_WITHIN_MS = 90
export const CONTINUE_MS = 20
/** One frame, by which a catching-up glide from rest starts earlier: it moves in its first frame. */
const FRAME_MS = 16

/** Ease-out cubic: fast start, gentle stop. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3

export interface Glide {
  fromX: number
  fromY: number
  toX: number
  toY: number
  start: number
  duration: number
  /** When it got its place `to`. */
  set: number
  /** Its speed at the start, in px per ms; that of the ease-out for a glide from rest. */
  vx: number
  vy: number
  /** A typing step: its way is `typingWay` with `crisp`; its start speed then does not count. */
  typing?: boolean
  /** Typing: 0 for an even step, 1 for the ease-out. */
  crisp?: number
  /** Typing: the time between the steps, smoothed. */
  interval?: number
  /** Carried by the layout, behind growing text: drawn where it is, and on from there after. */
  riding?: boolean
  /** Riding: the place in the text it rode at. */
  rodeAt?: number
  /** In a word carried over a wrap that slides to its place (R8): drawn where the word is. */
  carry?: Carried
}

/** The Hermite basis: how much of the start distance and of the start speed are left at `t`. */
const h00 = (t: number) => 2 * t ** 3 - 3 * t ** 2 + 1
const h10 = (t: number) => t ** 3 - 2 * t ** 2 + t

/** A cursor drawn at `to`, not moving. */
export function still(to: { x: number; y: number }, now: number): Glide {
  return {
    fromX: to.x,
    fromY: to.y,
    toX: to.x,
    toY: to.y,
    start: now,
    duration: GLIDE_MS,
    set: now,
    vx: 0,
    vy: 0,
  }
}

/** A glide from `from` to `to` with the start speed of the ease-out. */
function easingOut(
  from: { x: number; y: number },
  to: { x: number; y: number },
  start: number,
  duration: number,
  set: number,
): Glide {
  const vx = (3 * (to.x - from.x)) / duration
  const vy = (3 * (to.y - from.y)) / duration
  return { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, start, duration, set, vx, vy }
}

/** A glide from where `before` draws it now to `to`: a catch-up if `before` still moves. */
function glideFrom(
  before: Glide | undefined,
  shown: { x: number; y: number },
  to: { x: number; y: number },
  now: number,
): Glide {
  const since = before ? now - before.set : Infinity
  // a snap forgets the time of its place
  const glided = !!before && (before.fromX !== before.toX || before.fromY !== before.toY)
  if (!before || !glided) return easingOut(shown, to, now, GLIDE_MS, now)
  const duration = Math.min(GLIDE_MS, Math.max(MIN_CATCH_UP_MS, 1.5 * since))
  if (moving(before, now)) {
    // on with its speed toward the new place, from where it is drawn in this frame
    const dx = to.x - shown.x
    const dy = to.y - shown.y
    const distance = Math.hypot(dx, dy)
    const speed = glideSpeed(before, now)
    const along = Math.min(
      Math.max(0, (speed.x * dx + speed.y * dy) / distance),
      (3 * distance) / duration,
    )
    return {
      fromX: shown.x,
      fromY: shown.y,
      toX: to.x,
      toY: to.y,
      start: now,
      duration,
      set: now,
      vx: (along * dx) / distance,
      vy: (along * dy) / distance,
    }
  }
  if (since >= CATCH_UP_WITHIN_MS) return easingOut(shown, to, now, GLIDE_MS, now)
  // at rest a moment: on from the frame it ended in, if that was just now, else a frame back
  const ended = before.start + before.duration
  const start = now - ended <= CONTINUE_MS ? now : now - FRAME_MS
  return easingOut(shown, to, start, now + duration - start, now)
}

/** How fast a glide moves at `time`, in px per ms. */
export function glideSpeed(glide: Glide, time: number): { x: number; y: number } {
  const t = (time - glide.start) / glide.duration
  if (t < 0 || t >= 1) return { x: 0, y: 0 }
  if (glide.typing) {
    const v = typingSpeed(t, glide.crisp ?? 0) / glide.duration
    return { x: (glide.toX - glide.fromX) * v, y: (glide.toY - glide.fromY) * v }
  }
  // the derivatives of h00 and h10 by t
  const d00 = (6 * t ** 2 - 6 * t) / glide.duration
  const d10 = 3 * t ** 2 - 4 * t + 1
  return {
    x: d00 * (glide.fromX - glide.toX) + d10 * glide.vx,
    y: d00 * (glide.fromY - glide.toY) + d10 * glide.vy,
  }
}

/** Where a glide draws the cursor at `time`. */
export function glidePosition(glide: Glide, time: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, (time - glide.start) / glide.duration))
  if (glide.typing) {
    const way = typingWay(t, glide.crisp ?? 0)
    return {
      x: glide.fromX + (glide.toX - glide.fromX) * way,
      y: glide.fromY + (glide.toY - glide.fromY) * way,
    }
  }
  // how far it is from its place: d0 and the start speed, as Hermite says
  const a = h00(t)
  const b = h10(t) * glide.duration
  return {
    x: glide.toX + a * (glide.fromX - glide.toX) + b * glide.vx,
    y: glide.toY + a * (glide.fromY - glide.toY) + b * glide.vy,
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
  /** The width of a character: steps of a few are typing. None: no typing glides. */
  charWidth = 0,
): Glide {
  if (before && Math.abs(before.toX - to.x) < 0.5 && Math.abs(before.toY - to.y) < 0.5)
    return before
  const shown = before && glidePosition(before, now)
  if (animate && shown && glides(shown, to, lineHeight, width)) {
    const typing = typingGlide(before, shown, to, now, lineHeight, charWidth)
    return typing ?? glideFrom(before, shown, to, now)
  }
  return still(to, now)
}

/** The even glide of a typing step (R5b), if the step to `to` is one. */
function typingGlide(
  before: Glide,
  shown: { x: number; y: number },
  to: { x: number; y: number },
  now: number,
  lineHeight: number,
  charWidth: number,
): Glide | undefined {
  const since = now - before.set
  // a snap forgets the time of its place: the first step after it is no typing
  const glided = before.fromX !== before.toX || before.fromY !== before.toY
  if (!glided || since > TYPING_WITHIN_MS || charWidth <= 0) return undefined
  if (Math.abs(to.y - before.toY) >= lineHeight / 2) return undefined
  if (Math.abs(to.x - before.toX) > TYPING_CHARS * charWidth + 0.5) return undefined
  // the time between the steps, smoothed; the first step of a run takes it as it is
  const interval = smoothInterval(before.typing ? before.interval : undefined, since)
  const { duration, crisp, early } = typingStep(interval)
  return {
    fromX: shown.x,
    fromY: shown.y,
    toX: to.x,
    toY: to.y,
    // an even one a frame early: it moves in the frame it is drawn first
    start: now - early,
    duration,
    set: now,
    vx: 0,
    vy: 0,
    typing: true,
    crisp,
    interval,
  }
}

/** A glide to `to` from where `before` draws it now, however far; a snap without `before`. */
export function glideTo(
  before: Glide | undefined,
  to: { x: number; y: number },
  now: number,
): Glide {
  if (before && Math.abs(before.toX - to.x) < 0.5 && Math.abs(before.toY - to.y) < 0.5)
    return before
  return before ? glideFrom(before, glidePosition(before, now), to, now) : still(to, now)
}

/** Whether a glide still moves at `time`. */
export function moving(glide: Glide, time: number): boolean {
  return (
    (glide.fromX !== glide.toX || glide.fromY !== glide.toY) && time - glide.start < glide.duration
  )
}

/** Whether "Animate edits of others" applies now: on, no reduced motion, the page visible. */
export function animates(view: EditorView): boolean {
  return fadesText(view.state) && document.visibilityState !== 'hidden'
}

const CARET = '.cm-remote-caret[data-peer]'

/** The first cursor of a user: the one with the label (the key of `peerKey`). */
const isFirst = (key: string) => key.startsWith('0 ')

/** What the label of a first cursor needs, measured in `read`, relative to the content. */
interface LabelInfo {
  /** The box of the cursor without the shift of its glide. */
  caret: Box
  width: number
  height: number
  below: boolean
  inView: boolean
  /** The right edge of what is visible. */
  right: number
}

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
  /** Spans of fading text cut at a caret, to let go of. */
  private clipped = new Set<HTMLElement>()
  private frame = 0
  /** Carets that went away, while they fade out. */
  private readonly fading: HTMLElement
  /** The heads of the carets, to tell a new place from a move with the text. */
  private heads = new Map<string, number>()
  /** Carets that got a new place since they were read last. */
  private moves = new Set<string>()
  /** Carets that come, while they fade in: from what alpha, since when. */
  private appearing = new Map<string, { from: number; start: number | null }>()
  private readonly labels = new LabelMotion()
  /** Words carried over a wrap (R8), the parts of them drawn away now, and their spans. */
  private readonly carries = new WrapCarries()
  private carried: Carried[] = []
  private shifted = new Set<HTMLElement>()
  /** Where each caret is in the layout: its glide may aim elsewhere, at a carried word. */
  private bases = new Map<string, { x: number; y: number }>()
  private labelInfo = new Map<string, LabelInfo>()
  private localCaret: Box | null = null
  /** The mouse over the editor, in the coordinates of the page. */
  private hover: { x: number; y: number } | null = null
  private labelTimer: ReturnType<typeof setTimeout> | null = null
  private readonly onPointer = (event: MouseEvent) => {
    this.hover = event.type === 'mouseleave' ? null : { x: event.clientX, y: event.clientY }
    if (this.labelInfo.size > 0) this.schedule(false)
  }
  private readonly onScroll = () => {
    if (this.labelInfo.size > 0) this.schedule(false)
  }

  constructor(private readonly view: EditorView) {
    this.fading = view.scrollDOM.appendChild(document.createElement('div'))
    this.fading.className = 'cm-layer cm-remoteCaretFadeLayer'
    this.fading.setAttribute('aria-hidden', 'true')
    view.scrollDOM.addEventListener('mousemove', this.onPointer, { passive: true })
    view.scrollDOM.addEventListener('mouseleave', this.onPointer, { passive: true })
    view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true })
    this.noteHeads()
    this.schedule(false)
  }

  /** Notes which carets got a new place, and which came. */
  private noteHeads(mapped?: ViewUpdate): void {
    const next = new Map<string, number>()
    for (const s of this.view.state.field(remoteSelections)) {
      next.set(s.key, s.head)
      const before = this.heads.get(s.key)
      if (before === undefined) {
        // one that left a moment ago fades in from where it is
        const copy = this.copies.get(s.key)
        const from = copy ? Number(getComputedStyle(copy).opacity || 0) : 0
        if (animates(this.view)) this.appearing.set(s.key, { from, start: null })
      } else if ((mapped ? mapped.changes.mapPos(before, 1) : before) !== s.head)
        this.moves.add(s.key)
    }
    this.heads = next
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) this.carries.map(update.changes)
    // new places come with the peers; else the carets only move with the text
    if (update.transactions.some((tr) => tr.effects.some((e) => e.is(setPeers))))
      this.noteHeads(update)
    else if (update.docChanged)
      this.heads = new Map(this.view.state.field(remoteSelections).map((s) => [s.key, s.head]))
    // moved with the text or by a new place of the peer, or only laid out anew
    const moved = update.docChanged || update.transactions.some((tr) => tr.effects.length > 0)
    // the place a caret rode at goes along with the text
    if (update.docChanged)
      for (const [key, glide] of this.glides)
        if (glide.rodeAt !== undefined)
          this.glides.set(key, { ...glide, rodeAt: update.changes.mapPos(glide.rodeAt, -1) })
    if (moved || update.geometryChanged || update.viewportChanged) this.schedule(moved)
  }

  private schedule(moved: boolean): void {
    this.view.requestMeasure({
      read: () => this.read(moved),
      write: () => this.draw(),
    })
  }

  private read(moved: boolean): void {
    const now = frameNow()
    // the layout without the carried words: the draw shifts them again, before the paint
    this.unshift()
    if (animates(this.view) && this.view.lineWrapping)
      this.carried = this.carries.measure(this.view, now)
    else {
      this.carries.clear()
      this.carried = []
    }
    const bases = new Map<string, { x: number; y: number }>()
    const animate = moved && animates(this.view)
    const lineHeight = this.view.defaultLineHeight
    const charWidth = this.view.defaultCharacterWidth
    const width = this.view.contentDOM.clientWidth
    const origin = this.view.contentDOM.getBoundingClientRect()
    const scroller = this.view.scrollDOM.getBoundingClientRect()
    const baseX = scroller.left - this.view.scrollDOM.scrollLeft
    const baseY = scroller.top - this.view.scrollDOM.scrollTop
    // gone from the state, not only scrolled out of what CodeMirror draws
    const selections = this.view.state.field(remoteSelections)
    const present = new Set(selections.map((s) => s.key))
    const heads = new Map(selections.map((s) => [s.key, s.head]))
    if (animates(this.view))
      for (const [key, drawn] of this.drawn)
        if (!present.has(key)) this.leaving.push({ ...drawn, key })
    for (const key of this.copies.keys()) if (present.has(key)) this.returning.push(key)
    const next = new Map<string, Glide>()
    const drawn = new Map<string, Drawn>()
    const labels = new Map<string, LabelInfo>()
    for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
      const key = caret.dataset.peer!
      // in the text, so that scrolling moves nothing; without the shift of a glide under way
      const box = caret.getBoundingClientRect()
      const dx = Number(caret.dataset.dx ?? 0)
      const dy = Number(caret.dataset.dy ?? 0)
      const to = { x: box.left - origin.left - dx, y: box.top - origin.top - dy }
      const before = this.glides.get(key)
      const head = heads.get(key)
      bases.set(key, to)
      // a caret right at the start of the row is drawn at the end of the row above anyway
      const carry =
        head === undefined
          ? undefined
          : this.carried.find(
              (c) =>
                head >= c.start && head <= c.end && Math.abs(box.top - dy - c.top) < lineHeight / 2,
            )
      // in a word that slides to its place: drawn with it
      if (carry?.sliding) next.set(key, { ...still(to, now), carry })
      // in a word drawn at the end of the row above: it goes there, as if it was
      else if (carry) {
        const offset = carry.offset(now)
        const there = { x: to.x + offset.x, y: to.y + offset.y }
        next.set(key, retarget(before, there, now, animate, lineHeight, width, charWidth))
      } else if (head !== undefined && growsUpTo(this.view.state, head, now))
        next.set(key, { ...still(to, now), riding: true, rodeAt: head })
      // the growth ended where the layout carried it: on from there, without a glide
      else if (before?.riding && (head === before.rodeAt || before.rodeAt === undefined))
        next.set(key, still(to, now))
      // moved on from where it rode: from where the layout drew it there, as from rest
      else if (before?.riding) {
        const was = this.view.coordsAtPos(Math.min(before.rodeAt!, this.view.state.doc.length), 1)
        const is = head === undefined ? null : this.view.coordsAtPos(head, 1)
        const from = was && is ? { x: to.x + was.left - is.left, y: to.y + was.top - is.top } : to
        next.set(
          key,
          retarget(still(from, before.set), to, now, animate, lineHeight, width, charWidth),
        )
      } else next.set(key, retarget(before, to, now, animate, lineHeight, width, charWidth))
      drawn.set(key, { caret, x: box.left - baseX, y: box.top - baseY })
      if (!isFirst(key)) continue
      if (this.moves.has(key)) {
        // a jump: no glide there
        const glide = next.get(key)!
        const glided = glide.fromX !== glide.toX || glide.fromY !== glide.toY || !!glide.riding
        this.labels.moved(key, !animate || !glided, now)
      }
      const label = caret.querySelector<HTMLElement>('.cm-remote-caret-label')
      if (!label || head === undefined) continue
      const left = box.left - origin.left - dx
      const top = box.top - origin.top - dy
      const height = label.offsetHeight
      labels.set(key, {
        caret: { left, top, right: left + box.width, bottom: top + box.height },
        width: label.offsetWidth,
        height,
        // no room above on the first row; at the start of a row that continues a wrapped line
        // it would cover what was just written in the row above
        below: top - this.view.documentPadding.top < height || atWrappedRowStart(this.view, head),
        inView:
          box.bottom > scroller.top &&
          box.top < scroller.bottom &&
          box.right > scroller.left &&
          box.left < scroller.right,
        right:
          Math.min(scroller.left + this.view.scrollDOM.clientWidth, origin.right) - origin.left,
      })
    }
    this.moves.clear()
    this.labels.retain(new Set(labels.keys()))
    this.labelInfo = labels
    const local = this.view.hasFocus
      ? this.view.coordsAtPos(this.view.state.selection.main.head)
      : null
    this.localCaret = local && {
      left: local.left - origin.left,
      top: local.top - origin.top,
      right: local.right - origin.left,
      bottom: local.bottom - origin.top,
    }
    // carets scrolled out of view keep their last place, should they go away there
    for (const [key, last] of this.drawn)
      if (present.has(key) && !drawn.has(key)) drawn.set(key, last)
    this.glides = next
    this.bases = bases
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
    const now = frameNow()
    let running = false
    const animate = animates(this.view)
    // before anything is written: the layout is still clean
    const origin = this.labelInfo.size > 0 ? this.view.contentDOM.getBoundingClientRect() : null
    for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
      const key = caret.dataset.peer!
      const glide = this.glides.get(key)
      const base = this.bases.get(key) ?? (glide && { x: glide.toX, y: glide.toY })
      let dx = 0
      let dy = 0
      if (glide && base) {
        if (moving(glide, now)) running = true
        const at = glide.carry
          ? { x: base.x + glide.carry.offset(now).x, y: base.y + glide.carry.offset(now).y }
          : glidePosition(glide, now)
        dx = at.x - base.x
        dy = at.y - base.y
      }
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
        dx = dy = 0
        caret.style.transform = ''
        delete caret.dataset.dx
        delete caret.dataset.dy
      } else {
        caret.style.transform = `translate(${dx}px, ${dy}px)`
        caret.dataset.dx = String(dx)
        caret.dataset.dy = String(dy)
      }
      if (this.fadeIn(caret, key, now)) running = true
      const info = this.labelInfo.get(key)
      if (info && origin) this.placeLabel(caret, key, info, dx, dy, origin, now, animate)
    }
    this.shift(now)
    this.clip()
    if (this.labels.busy(now) || this.carries.busy(now)) running = true
    if (running) this.frame = requestAnimationFrame(() => this.draw())
    // a writer who rests, or has written steadily for long enough, changes its label later
    if (this.labelTimer) clearTimeout(this.labelTimer)
    const wait = this.labels.waitMs(now)
    this.labelTimer =
      wait === null
        ? null
        : setTimeout(() => {
            this.labelTimer = null
            this.draw()
          }, wait + 1)
  }

  /** Draws the carried words where they are now (R8): their spans, shifted. */
  private shift(now: number): void {
    const done = new Set<HTMLElement>()
    const spans = this.carried.some((c) => !c.caretOnly) ? appearingSpans(this.view.state) : []
    for (const carry of this.carried) {
      if (carry.caretOnly) continue
      const { x, y } = carry.offset(now)
      if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) continue
      for (const piece of spans) {
        if (piece.from < carry.start || piece.to > carry.end) continue
        for (const span of this.view.contentDOM.querySelectorAll<HTMLElement>(
          `[data-appear="${piece.id}"]`,
        )) {
          span.style.position = 'relative'
          span.style.left = `${x}px`
          span.style.top = `${y}px`
          done.add(span)
        }
      }
    }
    for (const span of this.shifted) if (!done.has(span)) unshiftSpan(span)
    this.shifted = done
  }

  private unshift(): void {
    for (const span of this.shifted) unshiftSpan(span)
    this.shifted.clear()
  }

  /** A caret that comes fades in, from where it was if it left a moment ago. */
  private fadeIn(caret: HTMLElement, key: string, now: number): boolean {
    const appear = this.appearing.get(key)
    if (!appear) return false
    appear.start ??= now
    const t = (now - appear.start) / FADE_OUT_MS
    if (t >= 1) {
      this.appearing.delete(key)
      caret.style.opacity = ''
      return false
    }
    // a ghost is faint: its class says how much
    const full = caret.classList.contains('cm-remote-caret--ghost') ? GHOST_OPACITY : 1
    caret.style.opacity = String(appear.from + (full - appear.from) * Math.max(0, t))
    return true
  }

  /** Puts the label of a first cursor where it belongs now, with its alpha (R9). */
  private placeLabel(
    caret: HTMLElement,
    key: string,
    info: LabelInfo,
    dx: number,
    dy: number,
    origin: DOMRect,
    now: number,
    animate: boolean,
  ): void {
    const label = caret.querySelector<HTMLElement>('.cm-remote-caret-label')
    if (!label) return
    const box = {
      left: info.caret.left + dx,
      top: info.caret.top + dy,
      right: info.caret.right + dx,
      bottom: info.caret.bottom + dy,
    }
    // the cursor stays under the label; a label of a cursor out of sight stays with it
    const x =
      box.left > info.right
        ? box.left
        : Math.max(box.left - info.width, Math.min(box.left, info.right - info.width))
    const hover = this.hover && { x: this.hover.x - origin.left, y: this.hover.y - origin.top }
    const { y, alpha } = this.labels.place(
      key,
      { ...info, caret: box, x, localCaret: this.localCaret, hover },
      now,
      animate,
    )
    const shiftX = x - box.left
    const shiftY = y - (box.top - info.height)
    label.style.transform =
      Math.abs(shiftX) < 0.01 && Math.abs(shiftY) < 0.01
        ? ''
        : `translate(${shiftX}px, ${shiftY}px)`
    label.style.opacity = alpha >= 1 ? '' : String(alpha)
    // the corner at the cursor is square
    label.classList.toggle('cm-remote-caret-label--below', y > box.top - info.height / 2)
  }

  /** Cuts fading text at the carets it ends at (R7). */
  private clip(): void {
    const { state } = this.view
    const spans = appearingSpans(state)
    const cut = new Map<string, HTMLElement>()
    if (spans.length > 0) {
      const heads = new Map(state.field(remoteSelections).map((s) => [s.key, s.head]))
      for (const caret of this.view.contentDOM.querySelectorAll<HTMLElement>(CARET)) {
        const head = heads.get(caret.dataset.peer!)
        if (head === undefined) continue
        // the chain of fading text that ends at the caret, and the one right behind it
        const ids = new Set<string>()
        for (let at = head, found = true; found;) {
          found = false
          for (const s of spans)
            if (s.to === at && !ids.has(s.id)) {
              ids.add(s.id)
              at = s.from
              found = true
            }
        }
        for (let at = head, found = true; found;) {
          found = false
          for (const s of spans)
            if (s.from === at && !ids.has(s.id)) {
              ids.add(s.id)
              at = s.to
              found = true
            }
        }
        for (const id of ids) cut.set(id, caret)
      }
    }
    const lineHeight = this.view.defaultLineHeight
    const reach = lineHeight / 2
    const done = new Set<HTMLElement>()
    for (const [id, caret] of cut) {
      const c = caret.getBoundingClientRect()
      // the middle of the caret's line, its border of 2 px
      const x = c.left + 1
      for (const span of this.view.contentDOM.querySelectorAll<HTMLElement>(
        `[data-appear="${id}"]`,
      )) {
        const box = span.getBoundingClientRect()
        let clip = ''
        // a row before the caret's: passed; a row after it: not yet
        if (box.bottom <= c.top + lineHeight / 4) clip = ''
        else if (box.top >= c.bottom - lineHeight / 4 || box.left >= x) clip = 'inset(50%)'
        else if (x < box.right + reach)
          clip = `inset(-${reach}px ${Math.max(-reach, box.right - x)}px -${reach}px -${reach}px)`
        span.style.clipPath = clip
        if (clip) done.add(span)
      }
    }
    for (const span of this.clipped) if (!done.has(span)) span.style.clipPath = ''
    this.clipped = done
  }

  destroy(): void {
    cancelAnimationFrame(this.frame)
    if (this.labelTimer) clearTimeout(this.labelTimer)
    this.view.scrollDOM.removeEventListener('mousemove', this.onPointer)
    this.view.scrollDOM.removeEventListener('mouseleave', this.onPointer)
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll)
    this.fading.remove()
  }
}

function unshiftSpan(span: HTMLElement): void {
  span.style.position = ''
  span.style.left = ''
  span.style.top = ''
}

/** Whether `head` is at the start of a row that continues a wrapped line. */
function atWrappedRowStart(view: EditorView, head: number): boolean {
  const { doc } = view.state
  if (head <= 0 || head > doc.length || doc.sliceString(head - 1, head) === '\n') return false
  const before = view.coordsAtPos(head, -1)
  const after = view.coordsAtPos(head, 1)
  return !!before && !!after && after.top >= before.bottom - 1
}

/** Lets the cursors of `remoteCursors` glide, and fade out when they go. */
export const cursorGlide = [
  ViewPlugin.fromClass(CursorGlider),
  EditorView.baseTheme({
    // with the flags of the carets that stay
    '.cm-remoteCaretFadeLayer': { zIndex: '10', pointerEvents: 'none' },
  }),
]
