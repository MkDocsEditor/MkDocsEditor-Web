import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, gutter } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import type { AuthorRun } from '@/sync/session'

import { withAlpha } from './remoteCursors'

/** How strong the marker on the text is; the Android app uses the same. */
const MARKER_ALPHA = 0.14

/**
 * How the editor shows who wrote what: nothing, a coloured strip next to each line, or the strip
 * and a light marker on the text. The values are the same as in the Android app.
 */
export type AuthorHighlightMode = 'off' | 'strip' | 'marker'

export interface AuthorshipState {
  runs: readonly AuthorRun[]
  mode: AuthorHighlightMode
}

/** The part of a line that one author wrote. */
export interface LineShare {
  username: string
  color: string
  /** Part of the line's characters, 0 to 1. Text without an author is left out. */
  fraction: number
}

/** Replaces the authorship runs and how they are shown. */
export const setAuthorship = StateEffect.define<AuthorshipState>()

export function authorshipDecorations(state: AuthorshipState, docLength: number): DecorationSet {
  if (state.mode === 'off') return Decoration.none
  const ranges: Range<Decoration>[] = []
  for (const run of state.runs) {
    const from = Math.max(0, Math.min(docLength, run.from))
    const to = Math.max(0, Math.min(docLength, run.to))
    if (from >= to) continue
    ranges.push(
      Decoration.mark({
        class: 'cm-author',
        attributes: {
          style: `background-color: ${withAlpha(run.color, MARKER_ALPHA)}`,
          title: run.username,
        },
        author: { username: run.username, color: run.color },
      }).range(from, to),
    )
  }
  return Decoration.set(ranges, true)
}

/** Who wrote what share of the line from `from` to `to`, in the order of the text. */
export function lineShares(spans: DecorationSet, from: number, to: number): LineShare[] {
  const shares: LineShare[] = []
  if (to <= from) return shares
  spans.between(from, to, (spanFrom, spanTo, span) => {
    const overlap = Math.min(spanTo, to) - Math.max(spanFrom, from)
    if (overlap <= 0) return
    const { username, color } = span.spec.author as { username: string; color: string }
    shares.push({ username, color, fraction: overlap / (to - from) })
  })
  return shares
}

class AuthorStripMarker extends GutterMarker {
  constructor(readonly shares: readonly LineShare[]) {
    super()
  }

  override eq(other: AuthorStripMarker): boolean {
    return (
      this.shares.length === other.shares.length &&
      this.shares.every((share, i) => {
        const o = other.shares[i]!
        return (
          share.username === o.username && share.color === o.color && share.fraction === o.fraction
        )
      })
    )
  }

  override toDOM(): HTMLElement {
    const strip = document.createElement('div')
    strip.className = 'cm-author-strip'
    for (const share of this.shares) {
      const part = document.createElement('div')
      part.style.height = `${share.fraction * 100}%`
      part.style.backgroundColor = share.color
      part.title = share.username
      strip.append(part)
    }
    return strip
  }
}

const authorshipField = StateField.define<{ mode: AuthorHighlightMode; spans: DecorationSet }>({
  create: () => ({ mode: 'off', spans: Decoration.none }),
  update(value, tr) {
    let next = tr.docChanged ? { ...value, spans: value.spans.map(tr.changes) } : value
    for (const effect of tr.effects) {
      if (effect.is(setAuthorship)) {
        next = {
          mode: effect.value.mode,
          spans: authorshipDecorations(effect.value, tr.state.doc.length),
        }
      }
    }
    return next
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) =>
      value.mode === 'marker' ? value.spans : Decoration.none,
    ),
})

/** One strip per line, as high as all rows of the line when it wraps. */
const authorStrip = gutter({
  class: 'cm-author-gutter',
  lineMarker(view, line) {
    const shares = lineShares(view.state.field(authorshipField).spans, line.from, line.to)
    return shares.length > 0 ? new AuthorStripMarker(shares) : null
  },
  lineMarkerChange: (update) =>
    update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setAuthorship))),
})

/** The strip takes no room while there is nothing to show. */
const authorStripSlot = new Compartment()

const toggleAuthorStrip = EditorState.transactionExtender.of((tr) => {
  for (const effect of tr.effects) {
    if (!effect.is(setAuthorship)) continue
    const show = effect.value.mode !== 'off' && effect.value.runs.length > 0
    if (show !== (authorStripSlot.get(tr.startState) === authorStrip)) {
      return { effects: authorStripSlot.reconfigure(show ? authorStrip : []) }
    }
  }
  return null
})

const authorshipTheme = EditorView.baseTheme({
  '.cm-author-gutter': { width: '3px' },
  '.cm-author-strip': { height: '100%' },
})

/** Highlights who wrote which part of the text ("who wrote what"). */
export function authorship() {
  return [authorshipField, authorStripSlot.of([]), toggleAuthorStrip, authorshipTheme]
}
