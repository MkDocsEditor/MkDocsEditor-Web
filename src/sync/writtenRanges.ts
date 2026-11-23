import type { AmDoc, Automerge, AutomergeApi } from './automerge'
import type { TextChange, WrittenRange } from './session'

/** More new changes than this at once are a catch-up (after a reconnect), not live writing. */
export const MAX_LIVE_CHANGES = 20
/** With several writers each change costs a diff of its own: fewer of them. */
export const MAX_MIXED_CHANGES = 8

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
 * The text one change inserted (the diff from `base` to the change), carried into `doc` with
 * cursors made at the change. A range whose first or last character was deleted since is left
 * out: its cursor would resolve to the next character, which is older text.
 */
export function rangesOfChange(
  A: AutomergeApi,
  doc: AmDoc,
  base: readonly string[],
  hash: string,
  writer: string,
): WrittenRange[] {
  const own = patchesToChanges(A.diff(doc, [...base], [hash]))
  if (!own) return []
  const inserted = insertedRanges(own)
  if (inserted.length === 0) return []
  const at = A.view(doc, [hash])
  const kept = (cursor: string, index: number) =>
    index >= 0 && index < doc.content.length && A.getCursor(doc, ['content'], index) === cursor
  const ranges: WrittenRange[] = []
  for (const { from, to } of inserted) {
    // cursors on the first and the last character: the end of the text has no character
    const first = A.getCursor(at, ['content'], from)
    const last = A.getCursor(at, ['content'], to - 1)
    const start = A.getCursorPosition(doc, ['content'], first)
    const end = A.getCursorPosition(doc, ['content'], last) + 1
    if (end > start && kept(first, start) && kept(last, end - 1))
      ranges.push({ writer, from: start, to: end })
  }
  return ranges
}

/**
 * The text each writer inserted with the changes that turned `before` into `doc`. `changes` are
 * those changes as sequential TextChanges. One writer: their ranges come from `changes` directly.
 * Several: each change is compared with its dependencies, because the sequential changes do not
 * say whose they are. Empty for a catch-up.
 *
 * `reveals` are the changes announced by `agent-change` (hash to `base`): their text comes from
 * the diff of the announcement, marked `reveal`, and in place of the other ranges of their writer.
 */
export function writtenRanges(
  A: AutomergeApi,
  doc: AmDoc,
  newChanges: readonly NewChange[],
  changes: readonly TextChange[],
  reveals: ReadonlyMap<string, readonly string[]> = new Map(),
): WrittenRange[] {
  const revealed: WrittenRange[] = []
  for (const change of newChanges) {
    const base = reveals.get(change.hash)
    if (!base) continue
    for (const range of rangesOfChange(A, doc, base, change.hash, change.actor))
      revealed.push({ ...range, reveal: true })
  }
  const revealing = new Set(revealed.map((r) => r.writer))
  return [
    ...revealed,
    ...plainRanges(A, doc, newChanges, changes).filter((r) => !revealing.has(r.writer)),
  ]
}

function plainRanges(
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
  if (newChanges.length > MAX_MIXED_CHANGES) return []
  return newChanges.flatMap((change) =>
    rangesOfChange(A, doc, change.deps, change.hash, change.actor),
  )
}
