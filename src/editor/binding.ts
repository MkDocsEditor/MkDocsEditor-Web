import { Annotation, ChangeSet, Transaction } from '@codemirror/state'
import type { ChangeSpec, Extension } from '@codemirror/state'
import { ViewPlugin } from '@codemirror/view'
import type { EditorView, ViewUpdate } from '@codemirror/view'

import type { DocumentSession, TextChange, TextSelection } from '@/sync/session'

/** Marks transactions that come from the session, so they are not sent back. */
const remoteChange = Annotation.define<boolean>()

/** Sequential TextChanges (each relative to the result of the previous) as one ChangeSet. */
export function toChangeSet(changes: readonly TextChange[], length: number): ChangeSet {
  let set = ChangeSet.empty(length)
  for (const { from, to, insert } of changes) {
    const spec: ChangeSpec = { from, to, insert }
    set = set.compose(ChangeSet.of(spec, set.newLength))
  }
  return set
}

/** A ChangeSet as sequential TextChanges. */
export function fromChangeSet(set: ChangeSet): TextChange[] {
  const changes: TextChange[] = []
  set.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    // Earlier changes are already applied, so this change starts at its position in the new doc.
    changes.push({ from: fromB, to: fromB + (toA - fromA), insert: inserted.toString() })
  })
  return changes
}

function selectionsOf(view: EditorView): TextSelection[] {
  if (!view.hasFocus) return []
  return view.state.selection.ranges.map((r) => ({ anchor: r.anchor, head: r.head }))
}

/**
 * Connects an editor to a DocumentSession: local edits and selections go to the session,
 * remote changes are applied to the editor (without entering the undo history).
 */
export function sessionBinding(session: DocumentSession): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly unsubscribe: () => void

      constructor(private readonly view: EditorView) {
        this.unsubscribe = session.onRemoteChanges((changes) => this.applyRemote(changes))
      }

      private applyRemote(changes: readonly TextChange[]): void {
        if (changes.length === 0) return
        const apply = () =>
          this.view.dispatch({
            changes: toChangeSet(changes, this.view.state.doc.length),
            annotations: [remoteChange.of(true), Transaction.addToHistory.of(false)],
          })
        // Sessions must not call listeners from inside applyLocalChanges, but if a remote change
        // arrives while CodeMirror is updating anyway, apply it right after the update.
        try {
          apply()
        } catch (error) {
          if (!(error instanceof Error) || !/update is in progress/.test(error.message)) throw error
          queueMicrotask(apply)
        }
      }

      update(update: ViewUpdate): void {
        for (const tr of update.transactions) {
          if (tr.docChanged && !tr.annotation(remoteChange)) {
            session.applyLocalChanges(fromChangeSet(tr.changes))
          }
        }
        if (update.selectionSet || update.focusChanged || update.docChanged) {
          session.setLocalSelections(selectionsOf(update.view))
        }
      }

      destroy(): void {
        this.unsubscribe()
        session.setLocalSelections([])
      }
    },
  )
}
