import { StateEffect, StateField } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

/** How long a highlight stays (it fades out over that time). */
export const FLASH_MS = 2_000

const flash = StateEffect.define<{ from: number; to: number } | null>()

const LINE = Decoration.line({ class: 'cm-flash-line' })

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(lines, tr) {
    let next = lines.map(tr.changes)
    for (const effect of tr.effects) {
      if (!effect.is(flash)) continue
      if (!effect.value) {
        next = Decoration.none
        continue
      }
      const doc = tr.state.doc
      const ranges: Range<Decoration>[] = []
      const last = Math.min(effect.value.to, doc.lines)
      for (let n = Math.max(1, effect.value.from); n <= last; n++)
        ranges.push(LINE.range(doc.line(n).from))
      next = Decoration.set(ranges)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const flashTheme = EditorView.baseTheme({
  '@keyframes cm-flash-fade': {
    from: { backgroundColor: 'rgba(var(--v-theme-primary), 0.22)' },
    to: { backgroundColor: 'transparent' },
  },
  '.cm-flash-line': { animation: `cm-flash-fade ${FLASH_MS}ms ease-in forwards` },
})

const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>()

/**
 * Scrolls lines `from` to `to` (1-based) to the top and highlights them for a moment. It changes
 * neither the text nor the selection.
 */
export function flashLines(view: EditorView, from: number, to: number): void {
  if (view.state.field(flashField, false) === undefined)
    view.dispatch({ effects: StateEffect.appendConfig.of([flashField, flashTheme]) })
  const line = view.state.doc.line(Math.max(1, Math.min(from, view.state.doc.lines)))
  view.dispatch({
    effects: [
      flash.of({ from, to }),
      EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 24 }),
    ],
  })
  clearTimeout(timers.get(view))
  timers.set(
    view,
    setTimeout(() => {
      timers.delete(view)
      if (view.dom.isConnected) view.dispatch({ effects: flash.of(null) })
    }, FLASH_MS),
  )
}
