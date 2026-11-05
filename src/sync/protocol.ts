import type { ActorInfo } from '@/api'

import type { SessionUser } from './session'

/**
 * The messages of the document websocket (`docs/sync-protocol.md` section 5, version 1). The
 * fields are optional where the session has a fallback for older or incomplete answers.
 */

export interface PresenceInfo {
  clientId: string
  /** The stable id of the account; absent on older servers. */
  accountId?: string
  username: string
  displayName?: string
  color?: string
  actorId?: string
  /** Stamped by the server: the last presence message of this connection, or when it connected. */
  lastActiveAt?: string
  selections?: { anchor: string; head: string }[]
}

/** Where an account's cursor was last in this document, also if it is offline now. */
export interface LastPosition {
  accountId: string
  selections?: { anchor: string; head: string }[]
}

export type ServerMessage =
  | {
      type: 'initial-content'
      epoch?: string
      documentState?: string
      readOnly?: boolean
      you?: SessionUser & { username: string }
      actors?: ActorInfo[]
    }
  | { type: 'sync-request'; syncMessage?: string }
  | ({ type: 'presence' } & PresenceInfo)
  | { type: 'presence-snapshot'; peers?: PresenceInfo[]; lastPositions?: LastPosition[] }
  | { type: 'presence-leave'; clientId: string }
  | ({ type: 'actor' } & ActorInfo)
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
