import type { DiffHunk, HunkLine } from '@/api'
import type { ChangeRange } from '@/markdown/changeRanges'

export type { DiffHunk, HunkLine }

/** One line of a unified diff, ready to show. */
export interface DiffLine {
  kind: 'add' | 'del' | 'context' | 'hunk'
  text: string
  /** Line numbers in the old and new text (1-based), where the line exists there; for a hunk,
   * where it starts. */
  oldLine?: number
  newLine?: number
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

/** Parses a unified diff (as `git diff` writes it) into display lines, without file headers. */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const raw of diff.split('\n')) {
    const hunk = HUNK.exec(raw)
    if (hunk) {
      inHunk = true
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      lines.push({ kind: 'hunk', text: hunk[3]?.trim() ?? '', oldLine, newLine })
      continue
    }
    if (!inHunk) continue // diff --git, index, ---, +++
    if (raw.startsWith('+')) lines.push({ kind: 'add', text: raw.slice(1), newLine: newLine++ })
    else if (raw.startsWith('-'))
      lines.push({ kind: 'del', text: raw.slice(1), oldLine: oldLine++ })
    else if (raw.startsWith(' '))
      lines.push({ kind: 'context', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ })
    // "\ No newline at end of file" and the empty last line are skipped
  }
  return lines
}

/** Counts added and removed lines. */
export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.kind === 'add') added++
    else if (line.kind === 'del') removed++
  }
  return { added, removed }
}

/** Hunks from a unified diff, for backends without `format=json`: they know no headings. */
export function hunksOfUnifiedDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | undefined
  for (const line of parseUnifiedDiff(diff)) {
    if (line.kind === 'hunk') {
      // git writes the start of an empty side as the line before it
      const oldStart = line.oldLine ?? 1
      const newStart = line.newLine ?? 1
      current = {
        heading: null,
        headingOccurrence: 0,
        offset: Math.max(newStart, 1) - 1,
        oldStart,
        oldLines: 0,
        newStart,
        newLines: 0,
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    const op = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
    if (op !== '+') current.oldLines++
    if (op !== '-') current.newLines++
    current.lines.push({ op, text: line.text })
  }
  return hunks
}

/** Counts the added and removed lines of hunks. */
export function hunkStats(hunks: readonly DiffHunk[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const hunk of hunks)
    for (const line of hunk.lines) {
      if (line.op === '+') added++
      else if (line.op === '-') removed++
    }
  return { added, removed }
}

/** A piece of a changed line; `changed` pieces differ from the paired line. */
export interface WordPiece {
  text: string
  changed: boolean
}

/** A hunk line to show: with word pieces when it pairs with a removed or added line. */
export interface ShownLine extends HunkLine {
  /** Line numbers in the old and new text, where the line exists there. */
  oldLine?: number
  newLine?: number
  pieces?: WordPiece[]
}

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu
/** Above this many token pairs a line gets no word highlights (the LCS table grows with it). */
const MAX_WORD_CELLS = 40_000

/** Which words of `before` and `after` differ, or undefined if the lines are too long to say. */
export function wordDiff(
  before: string,
  after: string,
): { before: WordPiece[]; after: WordPiece[] } | undefined {
  const a = before.match(TOKEN) ?? []
  const b = after.match(TOKEN) ?? []
  if (a.length * b.length > MAX_WORD_CELLS) return undefined
  // longest common subsequence, filled from the end
  const width = b.length + 1
  const table = new Uint16Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!)
  const left: WordPiece[] = []
  const right: WordPiece[] = []
  const push = (pieces: WordPiece[], text: string, changed: boolean) => {
    const last = pieces[pieces.length - 1]
    if (last && last.changed === changed) last.text += text
    else pieces.push({ text, changed })
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(left, a[i]!, false)
      push(right, b[j]!, false)
      i++
      j++
    } else if (
      j >= b.length ||
      (i < a.length && table[(i + 1) * width + j]! >= table[i * width + j + 1]!)
    ) {
      push(left, a[i++]!, true)
    } else {
      push(right, b[j++]!, true)
    }
  }
  return { before: left, after: right }
}

/**
 * The lines of a hunk with their numbers; a run of removed lines followed by a run of added
 * lines pairs up line by line, and paired lines get word pieces.
 */
export function showHunk(hunk: DiffHunk): ShownLine[] {
  let oldLine = hunk.oldStart
  let newLine = hunk.newStart
  const shown: ShownLine[] = hunk.lines.map((line) => {
    if (line.op === '+') return { ...line, newLine: newLine++ }
    if (line.op === '-') return { ...line, oldLine: oldLine++ }
    return { ...line, oldLine: oldLine++, newLine: newLine++ }
  })
  for (let i = 0; i < shown.length;) {
    if (shown[i]!.op !== '-') {
      i++
      continue
    }
    let removedEnd = i
    while (shown[removedEnd]?.op === '-') removedEnd++
    let addedEnd = removedEnd
    while (shown[addedEnd]?.op === '+') addedEnd++
    const pairs = Math.min(removedEnd - i, addedEnd - removedEnd)
    for (let k = 0; k < pairs; k++) {
      const removed = shown[i + k]!
      const added = shown[removedEnd + k]!
      const words = wordDiff(removed.text, added.text)
      // a line that changed completely is clearer without pieces
      if (words && words.before.some((p) => !p.changed)) {
        removed.pieces = words.before
        added.pieces = words.after
      }
    }
    i = addedEnd
  }
  return shown
}

/** The unchanged lines between two hunks (in the new text), folded away. */
export function linesBetween(previous: DiffHunk, next: DiffHunk): number {
  return next.newStart - (previous.newStart + previous.newLines)
}

/**
 * Where a hunk's changes are, as a range of the feed (`?change=` of the document page): from
 * its first changed line to its last added line, found again by heading and offset.
 */
export function rangeOfHunk(hunk: DiffHunk): ChangeRange {
  let newLine = hunk.newStart
  let first: number | undefined
  let lastAdded: number | undefined
  for (const line of hunk.lines) {
    if (line.op !== ' ' && first === undefined) first = newLine
    if (line.op === '+') lastAdded = newLine
    if (line.op !== '-') newLine++
  }
  const line = first ?? hunk.newStart
  return {
    line,
    count: lastAdded === undefined ? 0 : lastAdded - line + 1,
    heading: hunk.heading,
    headingOccurrence: hunk.headingOccurrence,
    offset: hunk.offset + (line - hunk.newStart),
  }
}
