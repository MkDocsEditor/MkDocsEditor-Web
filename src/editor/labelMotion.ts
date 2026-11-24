/**
 * Where the labels of others are, above or below their cursor, and how visible they are, so they
 * stay calm while somebody writes fast: the calm label (R9) of KodeEditor's docs/reveal.md, with
 * its numbers (`RemoteLabelMotion`).
 *
 * - A label goes below its cursor at once when it must, and back above only after its writer
 *   rested for `REST_MS` or jumped, so a writer who wraps rows quickly switches it at most once
 *   per run of writing.
 * - A change of the side moves the label in `SIDE_MS` with the cubic ease-out, from where it is.
 * - After `STEADY_MS` of writing without a rest, the label fades down to `DIM_ALPHA`. A rest, a
 *   jump or a cursor that comes into view shows it again.
 * - A label that covers the cursor of the person here fades down too; a mouse over a label or its
 *   cursor (`HOVER_SLACK` around them) shows it.
 *
 * Without animations, a label takes the side its cursor needs and is shown. Times are those of the
 * frames (`frameNow`).
 */
export const REST_MS = 2_000
export const STEADY_MS = 1_000
export const SIDE_MS = 120
export const LABEL_FADE_MS = 200
export const DIM_ALPHA = 0.35
export const HOVER_SLACK = 8

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Label {
  /** Whether it is below its cursor, or goes there. */
  below: boolean
  /** Placed before: the first place and a jump decide the side and the alpha at once. */
  placed: boolean
  /** A jump that the next place takes its side from. */
  jumped: boolean
  /** Where it was between above (0) and below (1) when the side changed, and when. */
  sideFrom: number
  sideStart: number | null
  /** The last new place of its cursor, and when the run of writing started. */
  movedAt: number | null
  runStart: number | null
  /** Its cursor was out of view: it starts a new run when it comes back. */
  unseen: boolean
  alphaFrom: number
  alphaTarget: number
  alphaStart: number | null
}

const easeOut = (t: number) => 1 - (1 - t) ** 3
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const inflate = (box: Box, by: number): Box => ({
  left: box.left - by,
  top: box.top - by,
  right: box.right + by,
  bottom: box.bottom + by,
})
const contains = (box: Box, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

export interface LabelPlace {
  /** Its cursor, where it is drawn. */
  caret: Box
  width: number
  height: number
  /** Where the label starts. */
  x: number
  /** Whether it must be below its cursor now; else it is above. */
  below: boolean
  inView: boolean
  /** The cursor of the person here, where it is drawn; null without one. */
  localCaret: Box | null
  /** Where the mouse is, null without one over the text. */
  hover: { x: number; y: number } | null
}

export class LabelMotion {
  private labels = new Map<string, Label>()

  /** Keeps the labels of `keys` only. */
  retain(keys: ReadonlySet<string>): void {
    for (const key of this.labels.keys()) if (!keys.has(key)) this.labels.delete(key)
  }

  private label(key: string): Label {
    let label = this.labels.get(key)
    if (!label) {
      label = {
        below: false,
        placed: false,
        jumped: false,
        sideFrom: 0,
        sideStart: null,
        movedAt: null,
        runStart: null,
        unseen: false,
        alphaFrom: 1,
        alphaTarget: 1,
        alphaStart: null,
      }
      this.labels.set(key, label)
    }
    return label
  }

  /** The first cursor of `key` got a new place at `now`; `jumped` if it did not glide there. */
  moved(key: string, jumped: boolean, now: number): void {
    const label = this.label(key)
    const rested = label.movedAt === null || now - label.movedAt >= REST_MS
    if (jumped) {
      // the place takes its side from it, and the run of writing starts anew
      label.jumped = true
      label.runStart = now
    } else if (rested || label.runStart === null) label.runStart = now
    label.movedAt = now
  }

  /**
   * Places the label of `key` at `now`: where its top is, relative to the top of its cursor's box
   * above (`caret.top - height`) as 0, and how visible it is.
   */
  place(
    key: string,
    place: LabelPlace,
    now: number,
    animate: boolean,
  ): { y: number; alpha: number } {
    const label = this.label(key)
    const { caret, height, width, x } = place
    const above = caret.top - height
    if (!animate) {
      label.below = place.below
      label.placed = false
      label.alphaFrom = label.alphaTarget = 1
      label.alphaStart = null
      label.sideStart = null
      return { y: place.below ? caret.bottom : above, alpha: 1 }
    }
    const rested = label.movedAt === null || now - label.movedAt >= REST_MS
    const first = !label.placed
    if (first || label.jumped) {
      label.placed = true
      label.jumped = false
      label.below = place.below
      label.sideStart = null
    } else if (place.below !== label.below && (place.below || rested)) {
      label.sideFrom = this.side(label, now)
      label.below = place.below
      label.sideStart = now
    }
    const y = lerp(above, caret.bottom, this.side(label, now))
    if (!place.inView) label.unseen = true
    else if (label.unseen) {
      label.unseen = false
      label.runStart = now
    }
    const box = { left: x, top: y, right: x + width, bottom: y + height }
    const hover = place.hover
    const hovered =
      !!hover &&
      (contains(inflate(box, HOVER_SLACK), hover.x, hover.y) ||
        contains(inflate(caret, HOVER_SLACK), hover.x, hover.y))
    const steady = !rested && label.runStart !== null && now - label.runStart >= STEADY_MS
    const target = hovered
      ? 1
      : // only faded down: a label that comes and goes as it passes the cursor would be noise
        steady || (place.localCaret && overlaps(box, place.localCaret))
        ? DIM_ALPHA
        : 1
    if (first) {
      label.alphaFrom = label.alphaTarget = target
      label.alphaStart = null
    } else if (target !== label.alphaTarget) {
      label.alphaFrom = this.alpha(label, now)
      label.alphaTarget = target
      label.alphaStart = now
    }
    return { y, alpha: this.alpha(label, now) }
  }

  /** Whether a label moves or fades at `now`: frames are needed then. */
  busy(now: number): boolean {
    for (const label of this.labels.values()) {
      if (label.sideStart !== null && now - label.sideStart < SIDE_MS) return true
      if (label.alphaStart !== null && now - label.alphaStart < LABEL_FADE_MS) return true
    }
    return false
  }

  /**
   * How long after `now` a label changes next without anything else happening (its writer rests,
   * or has written steadily for long enough), null if none waits for that.
   */
  waitMs(now: number): number | null {
    let next = Infinity
    for (const label of this.labels.values()) {
      if (label.movedAt === null || now - label.movedAt >= REST_MS) continue
      next = Math.min(next, label.movedAt + REST_MS)
      if (label.runStart !== null && now - label.runStart < STEADY_MS)
        next = Math.min(next, label.runStart + STEADY_MS)
    }
    return next === Infinity ? null : Math.max(0, next - now)
  }

  /** Where the label is between above (0) and below (1). */
  private side(label: Label, now: number): number {
    const target = label.below ? 1 : 0
    if (label.sideStart === null) return target
    const t = Math.min(1, Math.max(0, (now - label.sideStart) / SIDE_MS))
    if (t >= 1) label.sideStart = null
    return lerp(label.sideFrom, target, easeOut(t))
  }

  private alpha(label: Label, now: number): number {
    if (label.alphaStart === null) return label.alphaTarget
    const t = Math.min(1, Math.max(0, (now - label.alphaStart) / LABEL_FADE_MS))
    if (t >= 1) {
      label.alphaStart = null
      label.alphaFrom = label.alphaTarget
    }
    return lerp(label.alphaFrom, label.alphaTarget, t)
  }
}
