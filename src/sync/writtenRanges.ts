import type { AmDoc, Automerge, AutomergeApi } from './automerge'
import type { TextChange, WrittenRange } from './session'

/** More new changes than this at once are a catch-up (after a reconnect), not live writing. */
export const MAX_LIVE_CHANGES = 20

/** Where a position of the text before `change` is after it. */
function mapPos(pos: number, change: TextChange, assoc: -1 | 1): number {
  if (pos < change.from) return pos
  if (pos > change.to) return pos + change.insert.length - (change.to - change.from)
  if (change.from === change.to) return assoc > 0 ? pos + change.insert.length : pos
  // inside the replaced text: to its start or its end
  return assoc > 0 ? change.from + change.insert.length : change.from
}

/** The text that sequential changes insert, as ranges of the text after all of them. */
export function insertedRanges(changes: readonly TextChange[]): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  changes.forEach((change, i) => {
    if (!change.insert) return
    let from = change.from
    let to = change.from + change.insert.length
    for (const later of changes.slice(i + 1)) {
      from = mapPos(from, later, 1)
      to = mapPos(to, later, -1)
    }
    if (to > from) ranges.push({ from, to })
  })
  return ranges
}

/** Converts Automerge patches on `content` to sequential TextChanges, or null if unexpected. */
export function patchesToChanges(patches: readonly Automerge.Patch[]): TextChange[] | null {
  const changes: TextChange[] = []
  for (const patch of patches) {
    if (patch.path[0] !== 'content') continue
    const index = patch.path[1]
    if (patch.path.length !== 2 || typeof index !== 'number') return null
    if (patch.action === 'splice') changes.push({ from: index, to: index, insert: patch.value })
    else if (patch.action === 'del')
      changes.push({ from: index, to: index + (patch.length ?? 1), insert: '' })
    else return null
  }
  return changes
}

interface NewChange {
  hash: string
  actor: string
  deps: string[]
}

/**
 * The text each writer inserted with the changes that turned `before` into `doc`. `changes` are
 * those changes as sequential TextChanges. One writer: their ranges come from `changes` directly.
 * Several: each change is compared with its dependencies and its ranges are carried into `doc`
 * with cursors, because the sequential changes do not say whose they are. Empty for a catch-up.
 */
export function writtenRanges(
  A: AutomergeApi,
  doc: AmDoc,
  newChanges: readonly NewChange[],
  changes: readonly TextChange[],
): WrittenRange[] {
  if (newChanges.length === 0 || newChanges.length > MAX_LIVE_CHANGES) return []
  const writers = new Set(newChanges.map((c) => c.actor))
  if (writers.size === 1) {
    const [writer] = writers
    return insertedRanges(changes).map((r) => ({ writer: writer!, ...r }))
  }
  const ranges: WrittenRange[] = []
  for (const change of newChanges) {
    const own = patchesToChanges(A.diff(doc, change.deps, [change.hash]))
    if (!own) continue
    const inserted = insertedRanges(own)
    if (inserted.length === 0) continue
    const at = A.view(doc, [change.hash])
    for (const { from, to } of inserted) {
      // cursors on the first and the last character: the end of the text has no character
      const first = A.getCursor(at, ['content'], from)
      const last = A.getCursor(at, ['content'], to - 1)
      const start = A.getCursorPosition(doc, ['content'], first)
      const end = A.getCursorPosition(doc, ['content'], last) + 1
      if (end > start) ranges.push({ writer: change.actor, from: start, to: end })
    }
  }
  return ranges
}
