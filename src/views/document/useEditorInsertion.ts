import { onBeforeUnmount } from 'vue'

import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

import { insertionFor } from '@/editor/upload'
import type { TextReference } from '@/markdown/references'

/**
 * Changes the editor from outside of it: inserting from the pickers and the files panel, and
 * selecting what a reference or a link points at. `showEditor` brings it on screen first.
 */
export function useEditorInsertion(
  editorView: () => EditorView | null,
  text: () => string,
  showEditor: () => void,
) {
  function selectedText(): string {
    const view = editorView()
    if (!view) return ''
    const { from, to } = view.state.selection.main
    return view.state.sliceDoc(from, to)
  }

  /** Replaces a range with text as user input and puts the cursor after it. */
  function insertText(view: EditorView, from: number, to: number, insert: string): void {
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input.insert',
      scrollIntoView: true,
    })
    view.focus()
  }

  /** Replaces the selection (or inserts at the cursor). */
  function replaceSelection(insert: string): void {
    const view = editorView()
    if (!view || view.state.readOnly) return
    const { from, to } = view.state.selection.main
    insertText(view, from, to, insert)
  }

  /** Inserts snippets at the cursor, on lines of their own (like pasted files). */
  function insertSnippets(snippets: string[]): void {
    const view = editorView()
    if (!view || snippets.length === 0 || view.state.readOnly) return
    showEditor()
    const at = view.state.selection.main.head
    insertText(view, at, at, insertionFor(view.state.doc, at, snippets))
  }

  function reveal(reference: TextReference): void {
    const view = editorView()
    if (!view) return
    showEditor()
    const length = view.state.doc.length
    view.dispatch({
      selection: EditorSelection.range(
        Math.min(reference.from, length),
        Math.min(reference.to, length),
      ),
      scrollIntoView: true,
    })
    view.focus()
  }

  let revealTimer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(revealTimer))

  /** Selects a line, once the text is there. */
  function revealLine(number: number, attempt = 0): void {
    const view = editorView()
    // the editor creates its view a moment after the text is ready; on a slow device or
    // connection that can take seconds (10 s here)
    if (!view || view.state.doc.length < text().length) {
      if (attempt < 200) revealTimer = setTimeout(() => revealLine(number, attempt + 1), 50)
      return
    }
    const target = view.state.doc.line(Math.min(number, view.state.doc.lines))
    view.dispatch({
      selection: EditorSelection.range(target.from, target.to),
      scrollIntoView: true,
    })
    view.focus()
  }

  return { selectedText, replaceSelection, insertSnippets, reveal, revealLine }
}
