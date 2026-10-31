import type { Ref } from 'vue'

/**
 * The contract between the editor and a sync implementation.
 *
 * The editor (CodeMirror) only talks to a DocumentSession. Implementations: a read-only REST
 * snapshot, and the Automerge websocket session of the backend's sync protocol. All positions
 * are UTF-16 indices into the current text, like JavaScript strings and CodeMirror.
 */

/** One replacement. A list of changes applies in order: each one sees the text after the previous. */
export interface TextChange {
  from: number
  to: number
  insert: string
}

export interface TextSelection {
  anchor: number
  head: number
}

export type ConnectionState =
  /** Opening the connection or loading the document. */
  | 'connecting'
  /** Connected and in sync (or syncing). */
  | 'online'
  /** Lost the connection; local edits are kept and sent after the reconnect. */
  | 'offline'
  /** No live connection by design (read-only snapshot). */
  | 'snapshot'
  /** The session ended (document deleted, logged out, fatal error). */
  | 'closed'

export interface SessionUser {
  username: string
  displayName: string
  color: string
}

export interface Peer extends SessionUser {
  clientId: string
  /** Resolved to indices of the local text. Empty when the peer's editor is not focused. */
  selections: TextSelection[]
}

/** A range of text written by one user. Runs are sorted and do not overlap. */
export interface AuthorRun {
  from: number
  to: number
  username: string
  color: string
}

export interface SessionStatus {
  connection: ConnectionState
  readOnly: boolean
  /** True while local edits have not been confirmed by the server. */
  unsynced: boolean
  /** Human readable reason for `closed`, `offline` or a read-only state. */
  message?: string
}

export interface DocumentSession {
  readonly status: Readonly<Ref<SessionStatus>>
  /** Other users in this document (not including this connection). */
  readonly peers: Readonly<Ref<Peer[]>>
  /** Who wrote which part of the text. Empty when unknown. */
  readonly authorship: Readonly<Ref<AuthorRun[]>>
  /** The user of this connection, once known. */
  readonly me: Readonly<Ref<SessionUser | null>>
  /** Resolves when the first text is available. */
  readonly ready: Promise<void>

  /** The current text. */
  getText(): string
  /** Applies edits made in the local editor. */
  applyLocalChanges(changes: readonly TextChange[]): void
  /** Publishes the local cursor and selections (empty when the editor is not focused). */
  setLocalSelections(selections: readonly TextSelection[]): void
  /** Subscribes to text changes made by others (or by a resync). Returns an unsubscribe function. */
  onRemoteChanges(listener: (changes: readonly TextChange[]) => void): () => void
  /** Closes the connection. Unsynced edits stay persisted by implementations that support it. */
  close(): void
}

/** Applies a list of sequential changes to a string. */
export function applyChanges(text: string, changes: readonly TextChange[]): string {
  let result = text
  for (const { from, to, insert } of changes) {
    result = result.slice(0, from) + insert + result.slice(to)
  }
  return result
}

/**
 * Minimal single replacement turning `before` into `after` (common prefix and suffix are kept).
 * Avoids splitting UTF-16 surrogate pairs.
 */
export function diffText(before: string, after: string): TextChange[] {
  if (before === after) return []
  let start = 0
  const minLength = Math.min(before.length, after.length)
  while (start < minLength && before.charCodeAt(start) === after.charCodeAt(start)) start++
  let endBefore = before.length
  let endAfter = after.length
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore--
    endAfter--
  }
  const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff
  if (start > 0 && isLowSurrogate(before.charCodeAt(start))) start--
  if (endBefore < before.length && isLowSurrogate(before.charCodeAt(endBefore))) {
    endBefore++
    endAfter++
  }
  return [{ from: start, to: endBefore, insert: after.slice(start, endAfter) }]
}
