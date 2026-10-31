import { StateEffect, StateField } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import type { AuthorRun } from '@/sync/session'

import { withAlpha } from './remoteCursors'

export interface AuthorshipState {
  runs: readonly AuthorRun[]
  visible: boolean
}

/** Replaces the authorship runs and whether they are shown. */
export const setAuthorship = StateEffect.define<AuthorshipState>()

export function authorshipDecorations(state: AuthorshipState, docLength: number): DecorationSet {
  if (!state.visible) return Decoration.none
  const ranges: Range<Decoration>[] = []
  for (const run of state.runs) {
    const from = Math.max(0, Math.min(docLength, run.from))
    const to = Math.max(0, Math.min(docLength, run.to))
    if (from >= to) continue
    ranges.push(
      Decoration.mark({
        class: 'cm-author',
        attributes: {
          style: `background-color: ${withAlpha(run.color, 0.14)}; border-bottom: 2px solid ${withAlpha(run.color, 0.6)}`,
          title: run.username,
        },
      }).range(from, to),
    )
  }
  return Decoration.set(ranges, true)
}

const authorshipField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setAuthorship)) next = authorshipDecorations(effect.value, tr.state.doc.length)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** Highlights who wrote which part of the text ("who wrote what"). */
export function authorship() {
  return [authorshipField]
}
