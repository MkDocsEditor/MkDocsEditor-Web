import type { TextChange } from './session'

/** An author run without colour: positions are UTF-16 indices. */
export interface Run {
  from: number
  to: number
  /** null for text whose author is not known yet (until the next authorship fetch). */
  username: string | null
}

/** Converts a code point index into a UTF-16 index of `text`. */
export function codePointToUtf16(text: string, codePoint: number): number {
  let utf16 = 0
  let cp = 0
  while (cp < codePoint && utf16 < text.length) {
    const code = text.charCodeAt(utf16)
    utf16 += code >= 0xd800 && code <= 0xdbff && utf16 + 1 < text.length ? 2 : 1
    cp++
  }
  return utf16
}

/** Converts server runs (code points) to UTF-16 runs of `text`. */
export function runsFromCodePoints(
  text: string,
  runs: readonly { start: number; end: number; username: string }[],
): Run[] {
  // Runs are sorted, so walk the text once.
  const result: Run[] = []
  let utf16 = 0
  let cp = 0
  const advance = (target: number) => {
    while (cp < target && utf16 < text.length) {
      const code = text.charCodeAt(utf16)
      utf16 += code >= 0xd800 && code <= 0xdbff && utf16 + 1 < text.length ? 2 : 1
      cp++
    }
    return utf16
  }
  for (const run of [...runs].sort((a, b) => a.start - b.start)) {
    if (run.start < cp) continue
    const from = advance(run.start)
    const to = advance(run.end)
    if (to > from) result.push({ from, to, username: run.username })
  }
  return result
}

/**
 * Updates runs for sequential text changes. Deleted text disappears from the runs, inserted
 * text becomes a run of `author` (merged with a neighbouring run of the same author).
 */
export function applyChangesToRuns(
  runs: readonly Run[],
  changes: readonly TextChange[],
  author: string | null,
): Run[] {
  let current = runs.map((r) => ({ ...r }))
  for (const { from, to, insert } of changes) {
    const next: Run[] = []
    const delta = insert.length - (to - from)
    for (const run of current) {
      if (run.to <= from) {
        next.push(run)
      } else if (run.from >= to) {
        next.push({ ...run, from: run.from + delta, to: run.to + delta })
      } else {
        // overlaps the replaced range: keep the parts outside of it
        if (run.from < from) next.push({ ...run, to: from })
        if (run.to > to) next.push({ ...run, from: from + insert.length, to: run.to + delta })
      }
    }
    if (insert.length > 0) {
      next.push({ from, to: from + insert.length, username: author })
      next.sort((a, b) => a.from - b.from || a.to - b.to)
    }
    current = merge(next)
  }
  return current
}

function merge(runs: Run[]): Run[] {
  const result: Run[] = []
  for (const run of runs) {
    if (run.to <= run.from) continue
    const last = result.at(-1)
    if (last && last.username === run.username && last.to === run.from) last.to = run.to
    else result.push({ ...run })
  }
  return result
}
