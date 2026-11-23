import type { ActorInfo } from '@/api'

import type { SessionUser } from './session'

/**
 * The messages of the document websocket (`docs/sync-protocol.md` section 5, version 1). The
 * fields are optional where the session has a fallback for older or incomplete answers.
 */

/** Two cursors in the format of selections: the first and the last visible character. */
export interface ViewportInfo {
  top: string
  bottom: string
}

/**
 * Where an agent is (agent-presence.md section 3, "Agent focus"): indexes in Unicode code points
 * of the text at `revision` (heads, sorted, joined with '.').
 */
export interface AgentFocus {
  revision: string
  from: number
  /** After the last selected character; `from` for a cursor. */
  to: number
  /** The first and the last visible character, both inclusive. */
  viewport?: { top: number; bottom: number }
}

/** Marks a connection or actor of an AI agent or script: it acts for its account with this app token. */
export interface AgentInfo {
  tokenId: string
  /** The name of the app token, e.g. "Claude Code on Linux". */
  name: string
  /** Where the agent is, on servers with the feature `agent-focus`. */
  focus?: AgentFocus
}

/**
 * The own position as code point indexes at a revision (`at`, sync-protocol.md "Indexes"), for
 * servers with `presence-indexes`: they cannot resolve cursors. Never relayed to other clients.
 */
export interface PresenceIndexes {
  revision: string
  selections: { anchor: number; head: number }[]
  /** Inclusive; 0 and 0 for an empty text. Absent when the document is not shown. */
  viewport?: { top: number; bottom: number }
}

export interface PresenceInfo {
  clientId: string
  /** The client instance, which stays across reconnects and reloads; absent on older servers. */
  instanceId?: string
  /** The stable id of the account; absent on older servers. */
  accountId?: string
  /** Stamped by the server, from the login of this device. */
  deviceName?: string
  /** The color this instance chose, instead of `color` of the account. */
  instanceColor?: string
  username: string
  displayName?: string
  color?: string
  /** Hash of the account's profile picture, see `avatarUrl`; absent or null without one. */
  avatar?: string | null
  actorId?: string
  /** Stamped by the server: the last presence message of this connection, or when it connected. */
  lastActiveAt?: string
  selections?: { anchor: string; head: string }[]
  viewport?: ViewportInfo
  /** Present for an agent: it has no cursor and is listed with a robot. */
  agent?: AgentInfo
}

/** Where an account was last in this document, also if it is offline now. */
export interface LastPosition {
  accountId: string
  username?: string
  displayName?: string
  color?: string
  selections?: { anchor: string; head: string }[]
  viewport?: ViewportInfo
}

/** A client instance that left a moment ago. */
export interface GhostInfo {
  instanceId: string
  accountId: string
  username?: string
  displayName?: string
  color?: string
  instanceColor?: string
  avatar?: string | null
  deviceName?: string
  selections?: { anchor: string; head: string }[]
  viewport?: ViewportInfo
  agent?: AgentInfo
  /** How much longer it stays. */
  ghostMs: number
}

/** A connection left. Without `ghostMs` there is no ghost. */
export interface PresenceLeave {
  clientId: string
  instanceId?: string
  accountId?: string
  deviceName?: string
  instanceColor?: string
  avatar?: string | null
  selections?: { anchor: string; head: string }[]
  viewport?: ViewportInfo
  ghostMs?: number
}

export type ServerMessage =
  | {
      type: 'initial-content'
      epoch?: string
      documentState?: string
      readOnly?: boolean
      you?: SessionUser & { username: string; instanceId?: string; accountId?: string }
      actors?: ActorInfo[]
    }
  | { type: 'sync-request'; syncMessage?: string }
  | ({ type: 'presence' } & PresenceInfo)
  | {
      type: 'presence-snapshot'
      peers?: PresenceInfo[]
      lastPositions?: LastPosition[]
      ghosts?: GhostInfo[]
    }
  | ({ type: 'presence-leave' } & PresenceLeave)
  | ({ type: 'actor' } & ActorInfo)
  | {
      /** A live change of an agent, before the sync that carries it (agent-presence.md). */
      type: 'agent-change'
      clientId?: string
      instanceId?: string
      agent?: AgentInfo
      /** The heads before the change (its dependencies), as a revision. */
      base?: string
      /** The hash of the change. */
      change?: string
    }
  | { type: 'document-renamed'; newDocumentId?: string }
  | { type: 'document-deleted' }
  | { type: 'error'; code?: string }
  | { type: 'heartbeat' }

/** Sends a message to the server, if the socket is open. */
export type SendMessage = (message: Record<string, unknown>) => void

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
