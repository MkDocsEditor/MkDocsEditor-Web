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

/** The first source line at the top of the view, for scrolling the editor along. */
export function topSourceLine(root: HTMLElement): number | null {
  const view = root.getBoundingClientRect()
  const blocks = blocksOf(root)
  const block = blocks.find((b) => b.bottom > view.top + 1)
  return block ? block.line : null
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
