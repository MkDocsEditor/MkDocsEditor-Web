import { StateEffect, StateField } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import { SURFACE, contrastRatio } from '@/plugins/codeColors'
import { avatarUrl, loadedAvatarUrl } from '@/services/avatars'
import type { AvatarOwner } from '@/services/avatars'
import { instanceName } from '@/sync/session'
import type { Peer } from '@/sync/session'

/** Replaces the shown peers (their selections are indices of the current document). */
export const setPeers = StateEffect.define<readonly ShownPeer[]>()

/** Someone whose cursor shows. A ghost has left and is faint. */
export type ShownPeer = Pick<
  Peer,
  'username' | 'displayName' | 'color' | 'selections' | 'deviceName' | 'accountId' | 'avatar'
> & {
  ghost?: boolean
}

const GHOST_OPACITY = 0.4
/** WCAG 1.4.11: a flag with less contrast to the surface gets an outline (as on Android). */
const MIN_CONTRAST = 3

/** `#rgb` or `#rrggbb` as `#rrggbb`, or null for anything else. */
function fullHex(color: string): string | null {
  const hex = color.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full}` : null
}

/**
 * The themes on whose surface `color` is hard to see. Its flag gets an outline there; the fill
 * stays the exact colour, so the hue never changes.
 */
export function faintOn(color: string): ('light' | 'dark')[] {
  const hex = fullHex(color)
  if (!hex) return []
  return (['light', 'dark'] as const).filter(
    (theme) => contrastRatio(hex, SURFACE[theme]) < MIN_CONTRAST,
  )
}

class CursorWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly color: string,
    readonly ghost: boolean,
    readonly owner: AvatarOwner,
  ) {
    super()
  }

  override eq(other: CursorWidget): boolean {
    return (
      other.name === this.name &&
      other.color === this.color &&
      other.ghost === this.ghost &&
      other.owner.accountId === this.owner.accountId &&
      other.owner.avatar === this.owner.avatar
    )
  }

  toDOM(): HTMLElement {
    const caret = document.createElement('span')
    caret.className = [
      'cm-remote-caret',
      ...(this.ghost ? ['cm-remote-caret--ghost'] : []),
      ...faintOn(this.color).map((theme) => `cm-remote-caret--faint-${theme}`),
    ].join(' ')
    caret.style.borderColor = this.color
    caret.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.className = 'cm-remote-caret-label'
    label.style.backgroundColor = this.color
    label.textContent = this.name
    caret.appendChild(label)
    // the profile picture in front of the name, once it is there; without one only the name
    const loaded = loadedAvatarUrl(this.owner)
    if (loaded) label.prepend(avatarImage(loaded))
    else
      void avatarUrl(this.owner)
        ?.then((url) => label.prepend(avatarImage(url)))
        .catch(() => undefined)
    return caret
  }

  override ignoreEvent(): boolean {
    return true
  }
}

function avatarImage(url: string): HTMLImageElement {
  const image = document.createElement('img')
  image.className = 'cm-remote-caret-avatar'
  image.src = url
  image.alt = ''
  return image
}

/** Selection colour: the user colour with transparency. Accepts #rgb and #rrggbb. */
export function withAlpha(color: string, alpha: number): string {
  const full = fullHex(color)
  if (!full) return color
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${full}${a}`
}

export function peerDecorations(peers: readonly ShownPeer[], docLength: number): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const clamp = (n: number) => Math.max(0, Math.min(docLength, n))
  for (const peer of peers) {
    const name = instanceName(peer)
    for (const selection of peer.selections) {
      const anchor = clamp(selection.anchor)
      const head = clamp(selection.head)
      const from = Math.min(anchor, head)
      const to = Math.max(anchor, head)
      if (from < to) {
        ranges.push(
          Decoration.mark({
            class: 'cm-remote-selection',
            attributes: {
              style: `background-color: ${withAlpha(peer.color, peer.ghost ? 0.25 * GHOST_OPACITY : 0.25)}`,
            },
          }).range(from, to),
        )
      }
      ranges.push(
        Decoration.widget({
          widget: new CursorWidget(name, peer.color, !!peer.ghost, {
            accountId: peer.accountId,
            avatar: peer.avatar,
          }),
          side: 1,
        }).range(head),
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
  '.cm-remote-caret--ghost': {
    opacity: GHOST_OPACITY,
    transition: 'opacity 120ms',
  },
  // a faint name is hard to read: pointing at it shows it in full
  '.cm-remote-caret--ghost:hover': {
    opacity: '1',
  },
  '.cm-remote-caret--ghost .cm-remote-caret-label': {
    pointerEvents: 'auto',
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
  // a thin line in the text colour of the editor around a flag that is hard to see
  '.v-theme--light & .cm-remote-caret--faint-light .cm-remote-caret-label, .v-theme--dark & .cm-remote-caret--faint-dark .cm-remote-caret-label':
    {
      boxShadow: '0 0 0 1px rgba(var(--v-theme-on-surface), 0.6)',
    },
  // a circle the height of the text, in front of the name
  '.cm-remote-caret-avatar': {
    display: 'inline-block',
    width: '1.1em',
    height: '1.1em',
    marginLeft: '-2px',
    marginRight: '3px',
    borderRadius: '50%',
    objectFit: 'cover',
    verticalAlign: '-0.2em',
  },
})

/** Shows the cursors and selections of other users, labelled with their names. */
export function remoteCursors() {
  return [peersField, theme]
}
