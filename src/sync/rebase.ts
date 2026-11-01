import { applyChanges } from './session'
import type { TextChange } from './session'

/** Number of characters around a change used to find its place in a changed text. */
const CONTEXT = 40

/** The occurrence of `needle` in `text` closest to `hint`, or -1. */
function nearestIndex(text: string, needle: string, hint: number): number {
  let best = -1
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
    if (best < 0 || Math.abs(i - hint) < Math.abs(best - hint)) best = i
    if (i > hint) break
  }
  return best
}

/**
 * Finds where the text `removed`, which sat between `before` and `after`, is in `text` now.
 * Returns the start index. Text that only exists in `text` (edits by others) is never covered, so
 * a pure insert goes next to its old neighbours instead of replacing what was added there.
 */
function locate(text: string, before: string, removed: string, after: string): number {
  const hint = before.length
  if (text.startsWith(before) && text.startsWith(removed, before.length)) return before.length
  const end = text.length - after.length
  if (
    end - removed.length >= 0 &&
    text.endsWith(after) &&
    text.startsWith(removed, end - removed.length)
  ) {
    return end - removed.length
  }
  const prefix = before.slice(-CONTEXT)
  const suffix = after.slice(0, CONTEXT)
  for (const [needle, offset] of [
    [prefix + removed + suffix, prefix.length],
    [prefix + removed, prefix.length],
    [removed + suffix, 0],
  ] as const) {
    if (!needle) continue
    const index = nearestIndex(text, needle, hint - offset)
    if (index >= 0) return index + offset
  }
  return -1
}

/**
 * Re-applies `unsynced` (changes made on top of `base`) to `target`, a text that may differ from
 * `base`. Each change is placed by its surrounding text when possible, otherwise at the same
 * position (clamped). Text is never dropped: neither the inserted text nor text that only exists
 * in `target`.
 */
export function rebaseChanges(
  base: string,
  unsynced: readonly TextChange[],
  target: string,
): TextChange[] {
  const result: TextChange[] = []
  let text = target
  let baseText = base
  for (const change of unsynced) {
    const removed = baseText.slice(change.from, change.to)
    const found = locate(text, baseText.slice(0, change.from), removed, baseText.slice(change.to))
    // Not found: the removed text is gone or changed there, so only insert, at the old position.
    const from = found >= 0 ? found : Math.min(change.from, text.length)
    const to = found >= 0 ? found + removed.length : from
    result.push({ from, to, insert: change.insert })
    text = applyChanges(text, [{ from, to, insert: change.insert }])
    baseText = applyChanges(baseText, [change])
  }
  return result
}
