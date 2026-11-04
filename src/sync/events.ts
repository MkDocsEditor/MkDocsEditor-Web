import type { MovedItem } from '@/api'
import { CLOSE_HEARTBEAT_TIMEOUT, CLOSE_TICKET_REFUSED, SOCKET_OPEN, browserSocket } from './socket'
import type { SocketLike } from './socket'
import { watchPage } from './pageEvents'

/** A user who has a document open. */
export interface OnlineUser {
  username: string
  displayName: string
  color?: string
}

interface EventsHandlers {
  /** The tree changed, or events may have been missed (after every connect): fetch it again. */
  onTreeChanged(): void
  /** Items were moved or renamed and have new ids; `tree-changed` follows. */
  onItemsMoved?(moves: MovedItem[]): void
  /** The complete list of open documents and their users; replaces the previous one. */
  onOnline(documents: Map<string, OnlineUser[]>): void
  /** A working connection was lost, or a new one works again after that. */
  onConnectionChanged?(connected: boolean): void
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
  /** Silence that already means a dead connection when the page wakes up or the network changes. */
  doubtMs: 8_000,
  /** How long the ticket request, and then the socket until it opens, may take. */
  connectTimeoutMs: 10_000,
  /** A wake-up starts a new connection attempt at most this often. */
  retryNowMs: 2_000,
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
  const createSocket = options.createSocket ?? browserSocket
  let socket: SocketLike | null = null
  let closed = false
  let connected = false
  let attempt = 0
  let lastReceived = 0
  let lastSent = 0
  /** Numbers the connection attempts, so that an abandoned one can tell. */
  let attemptId = 0
  /** Since when the current attempt waits for its ticket or its socket; null if it is not. */
  let connectingSince: number | null = null
  let lastAttemptAt = 0
  /** There is a reason to doubt that the open socket still works; any message settles it. */
  let doubted = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function send(message: unknown): void {
    if (socket?.readyState !== SOCKET_OPEN) return
    socket.send(JSON.stringify(message))
    lastSent = Date.now()
  }

  /** The server's messages trigger ours too, because timers of a background tab are throttled. */
  function sendHeartbeatIfDue(): void {
    if (Date.now() - lastSent >= timing.heartbeatMs) send({ type: 'heartbeat' })
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

  function connectionLost(): void {
    socket = null
    if (connected) options.onConnectionChanged?.(false)
    connected = false
    connectingSince = null
    doubted = false
    options.onOnline(new Map())
  }

  /** Gives up without waiting for the browser, which can take a minute on a dead connection. */
  function abandonConnection(): void {
    attemptId++
    const stale = socket
    connectionLost()
    if (stale?.readyState === SOCKET_OPEN) stale.close(CLOSE_HEARTBEAT_TIMEOUT, 'heartbeat timeout')
    else stale?.close()
    scheduleReconnect()
  }

  function silenceLimit(): number {
    return doubted ? Math.min(timing.doubtMs, timing.timeoutMs) : timing.timeoutMs
  }

  function tick(): void {
    const now = Date.now()
    if (connectingSince !== null) {
      if (now - connectingSince > timing.connectTimeoutMs) abandonConnection()
    } else if (socket) {
      if (now - lastReceived > silenceLimit()) abandonConnection()
      else sendHeartbeatIfDue()
    }
  }

  /** The page came back or the network changed: check now, the timers may not have run. */
  function checkConnection(): void {
    if (closed) return
    const now = Date.now()
    if (socket && connectingSince === null) {
      doubted = true
      if (now - lastReceived <= silenceLimit()) return
      abandonConnection()
    }
    attempt = 0
    if (now - lastAttemptAt < timing.retryNowMs) {
      if (connectingSince === null) scheduleReconnect()
      return
    }
    if (connectingSince !== null) abandonConnection()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    void open()
  }

  /** Ends the connection handling for good. */
  function stop(): void {
    closed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    clearInterval(ticker)
    stopWatchingPage()
  }

  function onMessage(data: unknown): void {
    lastReceived = Date.now()
    doubted = false
    let message: { type?: string; documents?: unknown; moves?: unknown }
    try {
      message = JSON.parse(String(data)) as typeof message
    } catch {
      return
    }
    if (message.type === 'tree-changed') {
      options.onTreeChanged()
    } else if (message.type === 'items-moved') {
      const moves = (Array.isArray(message.moves) ? message.moves : []).filter(
        (m: Partial<MovedItem>): m is MovedItem =>
          typeof m?.oldId === 'string' && typeof m.newId === 'string' && typeof m.type === 'string',
      )
      if (moves.length > 0) options.onItemsMoved?.(moves)
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
        options.onConnectionChanged?.(true)
      }
      options.onOnline(map)
    }
  }

  async function open(): Promise<void> {
    if (closed) return
    const id = ++attemptId
    const abandoned = () => closed || id !== attemptId
    connectingSince = lastAttemptAt = Date.now()
    let ticket: string
    try {
      ticket = (await options.wsTicket()).ticket
    } catch (error) {
      if (abandoned()) return
      connectingSince = null
      if ((error as { isUnauthorized?: boolean }).isUnauthorized) {
        stop()
        options.onUnauthorized?.()
      } else scheduleReconnect()
      return
    }
    if (abandoned()) return
    const ws = createSocket(options.wsUrl('/events/ws/'))
    connectingSince = Date.now()
    socket = ws
    ws.onopen = () => {
      if (socket !== ws) return
      connectingSince = null
      lastReceived = Date.now()
      send({ type: 'hello', ticket, client: options.clientName })
      options.onTreeChanged()
    }
    ws.onmessage = (event) => {
      if (socket !== ws) return
      onMessage(event.data)
      sendHeartbeatIfDue()
    }
    ws.onerror = () => undefined
    ws.onclose = (event) => {
      if (socket !== ws) return
      connectionLost()
      if (event.code === CLOSE_TICKET_REFUSED) {
        // The ticket was refused: get a new one; a real auth problem shows up in wsTicket.
        attempt = Math.max(attempt, 1)
      }
      scheduleReconnect()
    }
  }

  const ticker = setInterval(tick, Math.min(timing.heartbeatMs, 1_000))
  const stopWatchingPage = watchPage({
    onWake: checkConnection,
    onOffline: () => {
      doubted = true
    },
  })

  void open()

  return {
    get connected() {
      return connected
    },
    close() {
      stop()
      const ws = socket
      socket = null
      ws?.close(1000, 'bye')
    },
  }
}
