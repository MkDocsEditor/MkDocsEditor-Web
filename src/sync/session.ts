import type { Ref } from 'vue'

import type { AgentInfo } from './protocol'

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

type ConnectionState =
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

/** The text someone is looking at: the indices of the first and the last visible character. */
export interface TextRange {
  top: number
  bottom: number
}

export interface SessionUser {
  username: string
  displayName: string
  color: string
  /** The account, for its profile picture; absent on older servers. */
  accountId?: string
  /** Hash of the profile picture, see `avatarUrl`. */
  avatar?: string | null
}

/** The user of this connection. */
export interface SessionMe extends SessionUser {
  /** The instance id the server uses for this connection, which can differ from the one sent. */
  instanceId?: string
}

/** Whom a cursor belongs to, with the device so that two instances of a person can be told apart. */
export function instanceName(who: {
  displayName?: string
  username: string
  deviceName?: string
  agent?: AgentInfo
}): string {
  const name = who.displayName || who.username
  if (who.agent) return `${who.agent.name} (agent of ${name})`
  return who.deviceName ? `${name} · ${who.deviceName}` : name
}

export interface Peer extends SessionUser {
  clientId: string
  /** The client instance. Following and ghosts go by this: a reconnect has a new `clientId`. */
  instanceId: string
  deviceName?: string
  lastActiveAt?: string
  /** Resolved to indices of the local text. Empty when the peer's editor is not focused. */
  selections: TextSelection[]
  /** The text this connection is looking at; absent while its editor is not visible. */
  viewport?: TextRange
  /** An AI agent or script with an app token of the account: no cursor, not to follow. */
  agent?: AgentInfo
}

/** The cursor of an instance that has left, which stays for a while. The server sets how long. */
export interface Ghost extends SessionUser {
  instanceId: string
  accountId: string
  deviceName?: string
  selections: TextSelection[]
  viewport?: TextRange
  agent?: AgentInfo
}

/** A range of text written by one user. Runs are sorted and do not overlap. */
export interface AuthorRun {
  from: number
  to: number
  /** The name to show: the person, and the agent when one wrote it ("Anna via Claude Code"). */
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
  /** Instances that have left this document a moment ago. Removed when they return or time out. */
  readonly ghosts: Readonly<Ref<Ghost[]>>
  /** Whether the server has told this connection who is here; false while disconnected. */
  readonly presenceKnown: Readonly<Ref<boolean>>
  /** Who wrote which part of the text. Empty when unknown. */
  readonly authorship: Readonly<Ref<AuthorRun[]>>
  /** The user of this connection, once known. */
  readonly me: Readonly<Ref<SessionMe | null>>
  /** Resolves when the first text is available. */
  readonly ready: Promise<void>

  /** The current text. */
  getText(): string
  /**
   * The revision of the text the server has too (its sorted heads joined by '.', like the
   * content API's ETag); null before the first sync.
   */
  sharedRevision(): string | null
  /** Applies edits made in the local editor. */
  applyLocalChanges(changes: readonly TextChange[]): void
  /**
   * Where the cursor of an account was last in this document, also if it is offline; null if
   * unknown or not resolvable. Reactive: it changes with the presence snapshot.
   */
  lastPositionOf(accountId: string): number | null
  /** Publishes the local cursor and selections (empty when the editor is not focused). */
  setLocalSelections(selections: readonly TextSelection[]): void
  /** Publishes the text the user is looking at; null when the editor pane is not visible. */
  setLocalViewport(viewport: TextRange | null): void
  /** Publishes the color of this instance; null goes back to the one of the account. */
  setLocalColor(color: string | null): void
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
