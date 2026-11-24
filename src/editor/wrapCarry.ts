import type { ChangeDesc } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

import { GROW_MS, appearingRanges, hiddenRanges } from './appearance'

/**
 * The word an agent's text is revealed into at the start of a wrapped row, drawn at the end of the
 * row above while it still fits there, like the word of somebody who types: the wrap carry (R8) of
 * KodeEditor's docs/reveal.md (`WrapCarries`). Hidden text keeps its space, so its rows are broken
 * as if all of it was there; without this, the head of the reveal jumps to the next row at the
 * start of a word that does not fit, before any of the word shows.
 *
 * - While the revealed part of the word fits behind the end of the row above, it is drawn there,
 *   and so is the cursor at its end.
 * - When it does not fit anymore, or the head leaves the word, it slides to its place in its row in
 *   the time of a slide (`GROW_MS`), with the cubic ease-out, and carries the cursor with it.
 * - After a revealed line break only the cursor glides that way, from the end of the line above
 *   to the start of the new one; the text stays at its place.
 *
 * Only text that appears is carried, so text that was there before never moves, and a word at its
 * place is not carried again while its text still appears. Without wrapping or animations nothing
 * is carried. The cursor glider (`cursorGlide`) measures it and draws it: the text by shifting its
 * spans (`position: relative`, which leaves the layout alone), the cursor by its transform.
 */

/** Pixels: a word that ends right at the wrap width still fits. */
const FIT_SLACK = 0.5

interface Entry {
  /** Where the word starts, at the start of its row. */
  start: number
  /** Where the carried part of the row ends. */
  end: number
  /** How far the word is from its place while it is carried. */
  dx: number
  dy: number
  /** Only the cursor glides, after a line break, where no word is carried. */
  caretOnly: boolean
  released: boolean
  /** When its slide to its place started, on the clock of the frames. */
  slideStart: number | null
  /** The top of its row on the page, as measured last. */
  top: number
}

/** A part of the text drawn away from its place now. */
export interface Carried {
  start: number
  end: number
  /** How far it is drawn from its place at `now` (and later, while it slides). */
  offset(now: number): { x: number; y: number }
  /** Whether it slides to its place now: the cursor in it rides along. */
  sliding: boolean
  /** The top of its row on the page, as measured. */
  top: number
  caretOnly: boolean
}

const easeOut = (t: number) => 1 - (1 - t) ** 3
const isSpace = (char: string) => /\s/.test(char)

export class WrapCarries {
  private entries = new Map<number, Entry>()
  /** The head of each reveal when measured last: a step under load can pass a whole word. */
  private heads = new Map<string, number>()

  /** The words keep their place in the text when it changes. */
  map(changes: ChangeDesc): void {
    if (this.entries.size === 0) return
    const moved = new Map<number, Entry>()
    for (const entry of this.entries.values()) {
      entry.start = changes.mapPos(entry.start, 1)
      entry.end = Math.max(entry.start, changes.mapPos(entry.end, -1))
      moved.set(entry.start, entry)
    }
    this.entries = moved
    for (const [tag, head] of this.heads) this.heads.set(tag, changes.mapPos(head, -1))
  }

  clear(): void {
    this.entries.clear()
    this.heads.clear()
  }

  /** Whether a word slides at `now`: frames are needed. */
  busy(now: number): boolean {
    for (const entry of this.entries.values())
      if (entry.released && (entry.slideStart === null || now - entry.slideStart < GROW_MS))
        return true
    return false
  }

  /**
   * The parts drawn away from their place, measured in the layout as it is now (without the shift
   * of carried text). In the measure phase.
   */
  measure(view: EditorView, now: number): Carried[] {
    const { state } = view
    const doc = state.doc
    const appearing = appearingRanges(state)
    /** Whether all of the text from `from` to `to` appears, or the character at `from`. */
    const appears = (from: number, to: number) => {
      if (from < 0) return false
      const last = Math.max(to, from + 1)
      for (let at = from; at < last;) {
        let reach = -1
        for (const r of appearing) if (r.from <= at && at < r.to) reach = Math.max(reach, r.to)
        if (reach < 0) return false
        at = reach
      }
      return true
    }
    const seen = new Set<number>()
    const heads = new Map<string, number>()
    for (const hidden of hiddenRanges(state)) {
      const head = hidden.from
      const before = this.heads.get(hidden.tag)
      if (!heads.has(hidden.tag)) heads.set(hidden.tag, head)
      if (head <= 0 || head > doc.length) continue
      // the character itself: at the edge of a span, a place can be drawn at the end of the row above
      const here = charBox(view, head)
      if (!here) continue
      const line = doc.lineAt(head)
      const start = rowStart(view, line.from, head, here.top)
      if (start === null) continue
      // a row that continues a wrapped line carries its word, the first row of a line the cursor
      const lineBreak = start === line.from
      if (lineBreak && line.number === 1) continue
      // the head left the word, or passed it in one step from the row above (frames came late)
      const passed = [...doc.sliceString(start, head)].some(isSpace)
      const leapt = passed && before !== undefined && before <= start && !this.entries.has(start)
      if (passed && !leapt) continue
      // what was there before stays, only what is revealed now is carried
      if (!appears(head === start || lineBreak ? start - 1 : start, head)) continue
      const above = view.coordsAtPos(lineBreak ? start - 1 : start, -1)
      const startAt = charBox(view, start)
      if (!above || !startAt || above.top >= startAt.top) continue
      const headX = head === start ? startAt.left : (view.coordsAtPos(head, -1)?.left ?? NaN)
      const fits =
        !lineBreak && above.left + headX - startAt.left <= wrapRight(view, start) + FIT_SLACK
      let entry = this.entries.get(start)
      if (!entry) {
        entry = {
          start,
          end: head,
          dx: 0,
          dy: 0,
          caretOnly: lineBreak,
          released: false,
          slideStart: null,
          top: startAt.top,
        }
        this.entries.set(start, entry)
      }
      seen.add(start)
      entry.end = Math.min(line.to, hidden.to)
      entry.top = startAt.top
      if (!entry.released) {
        entry.dx = above.left - startAt.left
        entry.dy = above.top - startAt.top
        if (!fits || leapt) entry.released = true
      }
    }
    this.heads = heads
    const carried: Carried[] = []
    for (const [start, entry] of this.entries) {
      // the head left the word: it goes to its place now
      if (!seen.has(start)) entry.released = true
      if (entry.released) entry.slideStart ??= now
      const done = entry.slideStart !== null && now - entry.slideStart >= GROW_MS
      // one at its place stays while its text appears, so that it is not carried up again
      if (done) {
        if (start > doc.length || !appears(entry.caretOnly ? start - 1 : start, start))
          this.entries.delete(start)
        continue
      }
      const { dx, dy, slideStart } = entry
      carried.push({
        start: entry.start,
        end: entry.end,
        caretOnly: entry.caretOnly,
        sliding: entry.released,
        top: entry.top,
        offset: (time) => {
          const left =
            slideStart === null
              ? 1
              : 1 - easeOut(Math.min(1, Math.max(0, (time - slideStart) / GROW_MS)))
          return { x: dx * left, y: dy * left }
        },
      })
    }
    return carried
  }
}

/** The start of the row of `head` (whose top is `top`) in its line, or null if not drawn. */
function rowStart(view: EditorView, lineFrom: number, head: number, top: number): number | null {
  let low = lineFrom
  let high = head
  // the first place in the line on the row of the head
  while (low < high) {
    const middle = (low + high) >> 1
    const at = charBox(view, middle)
    if (!at) return null
    if (at.bottom <= top + 1) low = middle + 1
    else high = middle
  }
  return low
}

/** The box of the character at `pos`, or of the place there at the end of a line. */
function charBox(
  view: EditorView,
  pos: number,
): { left: number; top: number; bottom: number } | null {
  return view.coordsForChar(pos) ?? view.coordsAtPos(pos, -1)
}

/** Where the rows of the line at `pos` wrap: the right edge of its content. */
function wrapRight(view: EditorView, pos: number): number {
  const { node } = view.domAtPos(pos)
  const line = (node instanceof Element ? node : node.parentElement)?.closest('.cm-line')
  if (!line) return Infinity
  const box = line.getBoundingClientRect()
  return box.right - parseFloat(getComputedStyle(line).paddingRight || '0')
}
