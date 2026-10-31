import type { SocketLike } from '@/sync/automergeSession'

/** A user who has a document open. */
export interface OnlineUser {
  username: string
  displayName: string
  color?: string
}

export interface EventsHandlers {
  /** The tree changed, or events may have been missed (after every connect): fetch it again. */
  onTreeChanged(): void
  /** The complete list of open documents and their users; replaces the previous one. */
  onOnline(documents: Map<string, OnlineUser[]>): void
  /** The connection was refused for good (bad credentials); the caller should log out. */
  onUnauthorized?(): void
}

export interface EventsOptions extends EventsHandlers {
  wsTicket(): Promise<{ ticket: string }>
  wsUrl(path: string): string
  createSocket?: (url: string) => SocketLike
  clientName: string
  timing?: Partial<typeof DEFAULT_TIMING>
}

const DEFAULT_TIMING = {
  heartbeatMs: 5_000,
  /** The server sends heartbeats too; silence this long means the connection is dead. */
  timeoutMs: 15_000,
  backoffMs: [1_000, 2_000, 5_000, 10_000, 30_000],
}

export interface EventsConnection {
  readonly connected: boolean
  close(): void
}

/**
 * Connects to the events websocket (`/events/ws/`, docs/sync-protocol.md "Events websocket")
 * and keeps the connection up: heartbeats, reconnects with backoff, and a tree refetch after
 * every connect, because events are lost while disconnected.
 */
export function connectEvents(options: EventsOptions): EventsConnection {
  const timing = { ...DEFAULT_TIMING, ...options.timing }
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as SocketLike)
  let socket: SocketLike | null = null
  let closed = false
  let connected = false
  let attempt = 0
  let lastReceived = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let ticker: ReturnType<typeof setInterval> | null = null

  function send(message: unknown): void {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message))
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return
    const delay = timing.backoffMs[Math.min(attempt, timing.backoffMs.length - 1)]!
    attempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void open()
    }, delay)
  }

  function stopTicker(): void {
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  function onMessage(data: unknown): void {
    lastReceived = Date.now()
    let message: { type?: string; documents?: unknown }
    try {
      message = JSON.parse(String(data)) as typeof message
    } catch {
      return
    }
    if (message.type === 'tree-changed') {
      options.onTreeChanged()
    } else if (message.type === 'online') {
      const map = new Map<string, OnlineUser[]>()
      const documents = Array.isArray(message.documents) ? message.documents : []
      for (const entry of documents as { documentId?: unknown; users?: unknown }[]) {
        if (typeof entry?.documentId !== 'string' || !Array.isArray(entry.users)) continue
        map.set(
          entry.documentId,
          (entry.users as OnlineUser[]).map((u) => ({
            username: u.username,
            displayName: u.displayName || u.username,
            color: u.color,
          })),
        )
      }
      if (!connected) {
        // The first message after hello: the connection works.
        connected = true
        attempt = 0
      }
      options.onOnline(map)
    }
  }

  async function open(): Promise<void> {
    if (closed) return
    let ticket: string
    try {
      ticket = (await options.wsTicket()).ticket
    } catch (error) {
      if ((error as { isUnauthorized?: boolean }).isUnauthorized) {
        closed = true
        options.onUnauthorized?.()
      } else scheduleReconnect()
      return
    }
    if (closed) return
    const ws = createSocket(options.wsUrl('/events/ws/'))
    socket = ws
    ws.onopen = () => {
      lastReceived = Date.now()
      send({ type: 'hello', ticket, client: options.clientName })
      options.onTreeChanged()
      stopTicker()
      ticker = setInterval(() => {
        if (Date.now() - lastReceived > timing.timeoutMs) ws.close(4008, 'heartbeat timeout')
        else send({ type: 'heartbeat' })
      }, timing.heartbeatMs)
    }
    ws.onmessage = (event) => onMessage(event.data)
    ws.onerror = () => undefined
    ws.onclose = (event) => {
      if (socket !== ws) return
      socket = null
      connected = false
      stopTicker()
      options.onOnline(new Map())
      if (event.code === 4001) {
        // The ticket was refused: get a new one; a real auth problem shows up in wsTicket.
        attempt = Math.max(attempt, 1)
      }
      scheduleReconnect()
    }
  }

  void open()

  return {
    get connected() {
      return connected
    },
    close() {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = null
      stopTicker()
      const ws = socket
      socket = null
      ws?.close(1000, 'bye')
    },
  }
}
