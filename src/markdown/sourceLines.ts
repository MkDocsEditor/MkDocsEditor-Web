/**
 * Where the rendered preview is, in lines of the markdown source. The renderer marks block
 * elements with `data-source-line` (their first line, 0-based); Android maps it the same way.
 */

interface Block {
  line: number
  top: number
  bottom: number
}

function blocksOf(root: HTMLElement): Block[] {
  return [...root.querySelectorAll<HTMLElement>('[data-source-line]')].map((el) => {
    const rect = el.getBoundingClientRect()
    return { line: Number(el.dataset.sourceLine), top: rect.top, bottom: rect.bottom }
  })
}

function lastIndex<T>(list: readonly T[], test: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i]!)) return i
  return -1
}

/** The last line of a block: up to the line before the next block, else to the end of the text. */
function lastLineOf(blocks: readonly Block[], index: number, lastLine: number): number {
  const line = blocks[index]!.line
  for (let i = index + 1; i < blocks.length; i++) {
    if (blocks[i]!.line > line) return Math.max(line, blocks[i]!.line - 1)
  }
  return Math.max(line, lastLine)
}

/**
 * The source lines on screen: from the first block whose top is in view to the last block whose
 * bottom is in view. A block taller than the view counts when it covers it. Null while the
 * preview is not on screen or has no blocks.
 */
export function visibleSourceLines(
  root: HTMLElement,
  lastLine: number,
): { first: number; last: number } | null {
  const view = root.getBoundingClientRect()
  if (view.height === 0) return null
  const blocks = blocksOf(root)
  const inView = (y: number) => y >= view.top && y <= view.bottom
  let first = blocks.findIndex((b) => inView(b.top))
  let last = lastIndex(blocks, (b) => inView(b.bottom))
  if (first < 0 || last < 0 || last < first) {
    // one block fills the view, or the view is between the tops of two blocks
    const covering = lastIndex(blocks, (b) => b.top <= view.top)
    if (covering < 0) return null
    if (first < 0) first = covering
    if (last < 0 || last < first) last = Math.max(first, covering)
  }
  return { first: blocks[first]!.line, last: lastLineOf(blocks, last, lastLine) }
}

/**
 * A place of the source shown at a height of the view: `line` is a source line (0-based) with
 * the fraction within it, `at` the height as a fraction of the view (0 top, 1 bottom). Split
 * mode shows the same place at the same height in the other pane.
 */
export interface ScrollAnchor {
  line: number
  at: number
}

/** How far a pane is scrolled, from 0 to 1; 0 when it cannot scroll. */
export function scrollProgress(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight
  return max > 0 ? Math.max(0, Math.min(1, el.scrollTop / max)) : 0
}

/** A source line and the height in the content where it starts. */
interface Point {
  line: number
  y: number
}

/**
 * The preview as points from source lines to heights in its content (not the view). Each block
 * runs from its first line to the next block's first line, and between their tops in height;
 * the last one to the end of the text and of the content. Blocks inside blocks that start on
 * the same line, or above the one before, add nothing.
 */
function pointsOf(root: HTMLElement, lastLine: number): Point[] {
  const offset = root.scrollTop - root.getBoundingClientRect().top
  const points: Point[] = []
  for (const block of blocksOf(root)) {
    const y = block.top + offset
    const before = points.at(-1)
    if (before && (block.line <= before.line || y < before.y)) continue
    if (!before && block.line > 0) points.push({ line: 0, y: 0 })
    points.push({ line: block.line, y })
  }
  const end = points.at(-1)
  if (end)
    points.push({ line: Math.max(end.line, lastLine) + 1, y: Math.max(end.y, root.scrollHeight) })
  return points
}

/** Straight between the two neighbours of `value` in `key`, clamped at both ends. */
function interpolate(points: readonly Point[], key: keyof Point, value: number): number {
  const other: keyof Point = key === 'line' ? 'y' : 'line'
  if (value <= points[0]![key]) return points[0]![other]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    if (value < b[key]) {
      const span = b[key] - a[key]
      return a[other] + (span > 0 ? ((value - a[key]) / span) * (b[other] - a[other]) : 0)
    }
  }
  return points.at(-1)![other]
}

/**
 * The reading place of the preview: at the height of its scroll progress, so that both panes
 * start together and end together. Null while it is hidden or has no blocks.
 */
export function previewAnchor(root: HTMLElement, lastLine: number): ScrollAnchor | null {
  if (root.clientHeight === 0) return null
  const points = pointsOf(root, lastLine)
  if (points.length === 0) return null
  const at = scrollProgress(root)
  return { line: interpolate(points, 'y', root.scrollTop + at * root.clientHeight), at }
}

/** The scroll position that shows `anchor` at its height, clamped to what the preview can do. */
export function previewScrollTop(
  root: HTMLElement,
  lastLine: number,
  anchor: ScrollAnchor,
): number | null {
  const points = pointsOf(root, lastLine)
  if (points.length === 0) return null
  const top = interpolate(points, 'line', anchor.line) - anchor.at * root.clientHeight
  return Math.max(0, Math.min(root.scrollHeight - root.clientHeight, top))
}

/** The text of lines `first` to `last` (0-based, inclusive), as character indices. */
export function lineRange(
  text: string,
  first: number,
  last: number,
): { top: number; bottom: number } {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  const clamp = (line: number) => Math.max(0, Math.min(starts.length - 1, line))
  const top = starts[clamp(first)]!
  const end = clamp(last)
  const bottom = end + 1 < starts.length ? starts[end + 1]! - 1 : text.length
  return { top, bottom: Math.max(top, bottom) }
}
