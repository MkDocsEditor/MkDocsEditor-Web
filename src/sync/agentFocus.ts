import type { AmDoc, AutomergeApi } from './automerge'
import type { AgentFocus } from './protocol'
import type { TextRange, TextSelection } from './session'

/** How long a client waits for a revision or a change it does not have yet (agent-presence.md). */
export const WAIT_LIMIT_MS = 30_000

/** The UTF-16 index of a code point index of `text` (the backend counts code points). */
export function utf16Index(text: string, codePoints: number): number {
  let index = 0
  for (let n = 0; n < codePoints && index < text.length; n++) {
    const code = text.charCodeAt(index)
    index += code >= 0xd800 && code < 0xdc00 && index + 1 < text.length ? 2 : 1
  }
  return index
}

/** The code point index of a UTF-16 index of `text`, for the server (which counts code points). */
export function codePointIndex(text: string, utf16: number): number {
  const end = Math.max(0, Math.min(text.length, utf16))
  let points = 0
  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i)
    // the low half of a pair is the same code point as its high half
    if (code >= 0xdc00 && code < 0xe000 && i > 0) {
      const before = text.charCodeAt(i - 1)
      if (before >= 0xd800 && before < 0xdc00) continue
    }
    points++
  }
  return points
}

/** The revision of heads: sorted, joined with '.', like the content API's ETag. */
export function revisionOf(heads: readonly string[]): string {
  return [...heads].sort().join('.')
}

/** The heads of a revision of the content API: sorted, joined with '.'. */
export function headsOf(revision: string): string[] {
  return revision.split('.').filter(Boolean)
}

/** A position made at a revision: a cursor on a character, after it, or the start. */
type Anchor = { cursor: string; after: boolean } | 'start'

export interface FocusAnchors {
  from: Anchor
  to: Anchor
  viewport?: { top: Anchor; bottom: Anchor }
}

/**
 * Cursors for the indexes of a focus, made in the text at its revision, so that they stay right
 * when people edit afterwards. Null while the document does not have the revision.
 */
export function focusAnchors(A: AutomergeApi, doc: AmDoc, focus: AgentFocus): FocusAnchors | null {
  const heads = headsOf(focus.revision)
  // no heads: the empty document, which every document has
  if (heads.length === 0) return { from: 'start', to: 'start' }
  // view() at heads the document lacks does not fail: it gives no text and end cursors
  if (!A.hasHeads(doc, heads)) return null
  const at = A.view(doc, heads)
  const text = at.content ?? ''
  const anchor = (codePoints: number): Anchor => {
    if (text.length === 0) return 'start'
    const index = utf16Index(text, codePoints)
    // the end of the text has no character: after the last one, or it would move with appends
    if (index >= text.length)
      return { cursor: A.getCursor(at, ['content'], text.length - 1), after: true }
    return { cursor: A.getCursor(at, ['content'], index), after: false }
  }
  return {
    from: anchor(focus.from),
    to: anchor(focus.to),
    ...(focus.viewport
      ? { viewport: { top: anchor(focus.viewport.top), bottom: anchor(focus.viewport.bottom) } }
      : {}),
  }
}

export interface ResolvedFocus {
  selections: TextSelection[]
  viewport?: TextRange
}

/** Where the anchors of a focus are in the current text. */
export function resolveAnchors(A: AutomergeApi, doc: AmDoc, anchors: FocusAnchors): ResolvedFocus {
  const length = doc.content.length
  const position = (anchor: Anchor): number => {
    if (anchor === 'start') return 0
    const index = A.getCursorPosition(doc, ['content'], anchor.cursor)
    // after a character that is still there; a deleted one resolves to the next character
    const still = index < length && A.getCursor(doc, ['content'], index) === anchor.cursor
    return Math.min(length, Math.max(0, index + (anchor.after && still ? 1 : 0)))
  }
  return {
    selections: [{ anchor: position(anchors.from), head: position(anchors.to) }],
    ...(anchors.viewport
      ? {
          viewport: {
            top: position(anchors.viewport.top),
            bottom: position(anchors.viewport.bottom),
          },
        }
      : {}),
  }
}

/** The indexes of a focus applied to the current text, clamped: when its revision never came. */
export function clampedFocus(text: string, focus: AgentFocus): ResolvedFocus {
  const at = (codePoints: number) => utf16Index(text, codePoints)
  return {
    selections: [{ anchor: at(focus.from), head: at(focus.to) }],
    ...(focus.viewport
      ? { viewport: { top: at(focus.viewport.top), bottom: at(focus.viewport.bottom) } }
      : {}),
  }
}
