import type { Text } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'

/** Uploads files and returns the markdown that embeds or links each of them. */
export type UploadFiles = (files: File[]) => Promise<string[]>

/**
 * The text to insert at `pos` for the uploaded `snippets`: one per line, on lines of their own,
 * so an image never ends up in the middle of a sentence.
 */
export function insertionFor(doc: Text, pos: number, snippets: readonly string[]): string {
  const before = pos > 0 ? doc.sliceString(pos - 1, pos) : '\n'
  const after = pos < doc.length ? doc.sliceString(pos, pos + 1) : '\n'
  return (before === '\n' ? '' : '\n') + snippets.join('\n') + (after === '\n' ? '' : '\n')
}

function filesOf(list: FileList | null | undefined): File[] {
  return list ? Array.from(list) : []
}

/**
 * Pasting or dropping files into the editor uploads them (through `upload`) and inserts the
 * markdown where they were pasted or dropped, even when the text changes during the upload.
 */
export function fileUpload(upload: UploadFiles) {
  return ViewPlugin.fromClass(
    class {
      /** Insert positions of running uploads, kept up to date with the edits. */
      pending = new Set<{ pos: number }>()

      constructor(readonly view: EditorView) {}

      update(update: ViewUpdate): void {
        if (!update.docChanged) return
        for (const p of this.pending) p.pos = update.changes.mapPos(p.pos)
      }

      start(files: File[], pos: number): void {
        const marker = { pos }
        this.pending.add(marker)
        upload(files)
          .then((snippets) => {
            if (snippets.length === 0 || !this.view.state.facet(EditorView.editable)) return
            const at = Math.min(marker.pos, this.view.state.doc.length)
            const insert = insertionFor(this.view.state.doc, at, snippets)
            this.view.dispatch({
              changes: { from: at, insert },
              selection: { anchor: at + insert.length },
              userEvent: 'input.upload',
            })
          })
          .catch(() => undefined) // the caller reports errors
          .finally(() => this.pending.delete(marker))
      }
    },
    {
      eventHandlers: {
        paste(event, view) {
          const files = filesOf(event.clipboardData?.files)
          if (files.length === 0 || !view.state.facet(EditorView.editable)) return false
          event.preventDefault()
          this.start(files, view.state.selection.main.head)
          return true
        },
        drop(event, view) {
          const files = filesOf(event.dataTransfer?.files)
          if (files.length === 0 || !view.state.facet(EditorView.editable)) return false
          event.preventDefault()
          const pos =
            view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
            view.state.selection.main.head
          this.start(files, pos)
          return true
        },
      },
    },
  )
}
