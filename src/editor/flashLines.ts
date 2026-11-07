import { StateEffect, StateField } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import type { ChangeTarget } from '@/markdown/changeRanges'

/** How long a highlight stays (it fades out over that time). */
export const FLASH_MS = 2_000

const flash = StateEffect.define<readonly ChangeTarget[] | null>()

const LINE = Decoration.line({ class: 'cm-flash-line' })
/** Removed lines: a thin marker between two lines. */
const REMOVED = Decoration.line({ class: 'cm-flash-removed' })
/** Removed at the end of a text without a newline at its end: below the last line. */
const REMOVED_AT_END = Decoration.line({ class: 'cm-flash-removed cm-flash-removed--end' })

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
      for (const target of effect.value) {
        const first = Math.max(1, Math.min(target.from, doc.lines))
        if (target.removal) {
          const deco = target.from > doc.lines ? REMOVED_AT_END : REMOVED
          ranges.push(deco.range(doc.line(first).from))
          continue
        }
        const last = Math.min(target.to, doc.lines)
        for (let n = first; n <= last; n++) ranges.push(LINE.range(doc.line(n).from))
      }
      next = Decoration.set(ranges, true)
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
  '@keyframes cm-flash-marker': {
    from: { boxShadow: 'inset 0 3px rgba(var(--v-theme-primary), 0.9)' },
    to: { boxShadow: 'inset 0 3px transparent' },
  },
  '.cm-flash-line': { animation: `cm-flash-fade ${FLASH_MS}ms ease-in forwards` },
  '@keyframes cm-flash-marker-end': {
    from: { boxShadow: 'inset 0 -3px rgba(var(--v-theme-primary), 0.9)' },
    to: { boxShadow: 'inset 0 -3px transparent' },
  },
  '.cm-flash-removed': { animation: `cm-flash-marker ${FLASH_MS}ms ease-in forwards` },
  '.cm-flash-removed--end': { animationName: 'cm-flash-marker-end' },
})

const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>()

/**
 * Scrolls the first target to the top and highlights all for a moment. It changes neither the
 * text nor the selection.
 */
export function flashLines(view: EditorView, targets: readonly ChangeTarget[]): void {
  if (targets.length === 0) return
  if (view.state.field(flashField, false) === undefined)
    view.dispatch({ effects: StateEffect.appendConfig.of([flashField, flashTheme]) })
  const line = view.state.doc.line(Math.max(1, Math.min(targets[0]!.from, view.state.doc.lines)))
  view.dispatch({
    effects: [flash.of(targets), EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 24 })],
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
