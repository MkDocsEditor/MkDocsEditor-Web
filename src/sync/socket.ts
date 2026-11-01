/** The subset of WebSocket the sessions need (replaced by a fake in tests). */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number; reason?: string }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export const SOCKET_OPEN = 1

/** Close codes of the websockets (`docs/sync-protocol.md` section 5). */
export const CLOSE_TICKET_REFUSED = 4001
export const CLOSE_REFUSED = 4003
export const CLOSE_DELETED = 4004
export const CLOSE_HEARTBEAT_TIMEOUT = 4008
export const CLOSE_RENAMED = 4009
export const CLOSE_PROTOCOL_ERROR = 4400

export function browserSocket(url: string): SocketLike {
  return new WebSocket(url) as SocketLike
}
