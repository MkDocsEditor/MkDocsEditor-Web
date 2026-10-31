import { StateEffect, StateField } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import type { Peer } from '@/sync/session'

/** Replaces the shown peers (their selections are indices of the current document). */
export const setPeers = StateEffect.define<readonly Peer[]>()

class CursorWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly color: string,
  ) {
    super()
  }

  override eq(other: CursorWidget): boolean {
    return other.name === this.name && other.color === this.color
  }

  toDOM(): HTMLElement {
    const caret = document.createElement('span')
    caret.className = 'cm-remote-caret'
    caret.style.borderColor = this.color
    caret.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.className = 'cm-remote-caret-label'
    label.style.backgroundColor = this.color
    label.textContent = this.name
    caret.appendChild(label)
    return caret
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** Selection colour: the user colour with transparency. Accepts #rgb and #rrggbb. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return color
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${full}${a}`
}

export function peerDecorations(peers: readonly Peer[], docLength: number): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const clamp = (n: number) => Math.max(0, Math.min(docLength, n))
  for (const peer of peers) {
    const name = peer.displayName || peer.username
    for (const selection of peer.selections) {
      const anchor = clamp(selection.anchor)
      const head = clamp(selection.head)
      const from = Math.min(anchor, head)
      const to = Math.max(anchor, head)
      if (from < to) {
        ranges.push(
          Decoration.mark({
            class: 'cm-remote-selection',
            attributes: { style: `background-color: ${withAlpha(peer.color, 0.25)}` },
          }).range(from, to),
        )
      }
      ranges.push(
        Decoration.widget({ widget: new CursorWidget(name, peer.color), side: 1 }).range(head),
      )
    }
  }
  return Decoration.set(ranges, true)
}

const peersField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setPeers)) next = peerDecorations(effect.value, tr.state.doc.length)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const theme = EditorView.baseTheme({
  '.cm-remote-caret': {
    position: 'relative',
    borderLeft: '2px solid',
    marginLeft: '-1px',
    marginRight: '-1px',
  },
  '.cm-remote-caret-label': {
    position: 'absolute',
    top: '-1.35em',
    left: '-2px',
    padding: '0 4px',
    borderRadius: '3px 3px 3px 0',
    color: '#fff',
    fontSize: '0.75em',
    lineHeight: '1.35em',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: '10',
    fontFamily: 'system-ui, sans-serif',
  },
})

/** Shows the cursors and selections of other users, labelled with their names. */
export function remoteCursors() {
  return [peersField, theme]
}
