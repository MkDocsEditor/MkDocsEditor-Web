import { ApiError } from '@/api'
import { urlPath } from '@/api/client'
import type { WsTicket } from '@/api'

import { watchPage } from './pageEvents'
import { CLOSE_HEARTBEAT_TIMEOUT, SOCKET_OPEN, browserSocket } from './socket'
import type { SocketLike } from './socket'

interface ConnectionTiming {
  heartbeatMs: number
  timeoutMs: number
  doubtMs: number
  connectTimeoutMs: number
  retryNowMs: number
  backoffMs: number[]
}

export interface ConnectionOptions {
  timing: ConnectionTiming
  createSocket?: (url: string) => SocketLike
  api: {
    wsTicket(): Promise<WsTicket>
    wsUrl(path: string): string
  }
  documentId: () => string
  hasDocument: () => boolean
  /** Waited for before every attempt. */
  beforeConnect: () => Promise<void>
  /** The first message on a new socket. */
  hello: (ticket: string) => Record<string, unknown>
  onState: (state: 'connecting' | 'offline') => void
  onNewSocket: () => void
  /** Returns false when the connection cannot go on from here: it is replaced by a new one. */
  onMessage: (data: unknown) => boolean
  /** The socket is gone. Decides what comes next, usually `scheduleReconnect`. */
  onClose: (code: number) => void
  /** The server does not hand out tickets for this user any more. */
  onSignedOut: () => void
  /**
   * The ticket came, so the server is there, but it refused the upgrade: browsers do not tell why.
   */
  onUpgradeRefused: () => void
}

/**
 * The websocket of a document session, kept alive: tickets, connection attempts with backoff,
 * heartbeats, and noticing dead connections. What the messages mean is up to the session.
 */
export function createConnection(options: ConnectionOptions) {
  const { timing } = options
  const createSocket = options.createSocket ?? browserSocket

  let socket: SocketLike | null = null
  let synced = false // received initial-content on the current socket
  let stopped = false
  let attempt = 0
  /** Numbers the connection attempts, so that an abandoned one can tell. */
  let attemptId = 0
  /** Since when the current attempt waits for its ticket or its socket; null if it is not. */
  let connectingSince: number | null = null
  let lastAttemptAt = 0
  /** There is a reason to doubt that the open socket still works; any message settles it. */
  let doubted = false
  let lastSent = 0
  let lastReceived = 0
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let stopWatchingPage: (() => void) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function send(message: Record<string, unknown>): void {
    if (socket?.readyState !== SOCKET_OPEN) return
    socket.send(JSON.stringify(message))
    lastSent = Date.now()
  }

  /**
   * Browsers throttle the timers of a background tab to one wake-up per minute, but still deliver
   * websocket messages. So the server's own heartbeats drive ours too; on `tick` alone the server
   * would close the connection of a background tab after 15 s (`4008`).
   */
  function sendHeartbeatIfDue(): void {
    if (synced && Date.now() - lastSent >= timing.heartbeatMs) send({ type: 'heartbeat' })
  }

  async function connect(): Promise<void> {
    if (stopped) return
    const id = ++attemptId
    const abandoned = () => stopped || id !== attemptId
    clearReconnectTimer()
    connectingSince = lastAttemptAt = Date.now()
    options.onState(options.hasDocument() || attempt > 0 ? 'offline' : 'connecting')
    // the stored copy follows a rename first (its epoch goes into hello)
    await options.beforeConnect()
    if (abandoned()) return
    let ticket: WsTicket
    try {
      ticket = await options.api.wsTicket()
    } catch (error) {
      if (abandoned()) return
      connectingSince = null
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        options.onSignedOut()
        return
      }
      scheduleReconnect()
      return
    }
    if (abandoned()) return

    let ws: SocketLike
    try {
      ws = createSocket(options.api.wsUrl(urlPath`/document/${options.documentId()}/ws`))
    } catch (error) {
      console.error('mkdocseditor: could not open the websocket', error)
      connectingSince = null
      scheduleReconnect()
      return
    }
    connectingSince = Date.now()
    socket = ws
    synced = false
    options.onNewSocket()
    let opened = false
    ws.onopen = () => {
      if (socket !== ws) return
      opened = true
      connectingSince = null
      lastReceived = Date.now()
      send(options.hello(ticket.ticket))
    }
    ws.onmessage = (event) => {
      if (socket !== ws) return
      lastReceived = Date.now()
      doubted = false
      if (!options.onMessage(event.data)) {
        abandonConnection()
        return
      }
      sendHeartbeatIfDue()
    }
    ws.onerror = () => undefined
    ws.onclose = (event) => {
      if (socket !== ws) return
      socket = null
      synced = false
      connectingSince = null
      options.onClose(event.code)
      if (!opened && !stopped) options.onUpgradeRefused()
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return
    options.onState(options.hasDocument() ? 'offline' : 'connecting')
    const delay = timing.backoffMs[Math.min(attempt, timing.backoffMs.length - 1)]!
    attempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, delay)
  }

  /**
   * Gives up on the current attempt or socket and reconnects. It does not wait for the browser:
   * a request or a socket on a dead connection can take minutes to fail, and so can closing one.
   */
  function abandonConnection(): void {
    attemptId++
    connectingSince = null
    doubted = false
    const stale = socket
    socket = null
    synced = false
    if (stale?.readyState === SOCKET_OPEN) stale.close(CLOSE_HEARTBEAT_TIMEOUT, 'heartbeat timeout')
    else stale?.close()
    options.onClose(CLOSE_HEARTBEAT_TIMEOUT)
  }

  /** How long the current socket may stay silent. */
  function silenceLimit(): number {
    return doubted ? Math.min(timing.doubtMs, timing.timeoutMs) : timing.timeoutMs
  }

  /**
   * Checks the connection instead of waiting for the backoff or for `tick`, whose timers may
   * have been throttled or stopped. `userWaits` is for a page that came back to the user, which
   * also ends a long backoff. Keystrokes only retry as often as `retryNowMs` allows.
   */
  function check(userWaits: boolean): void {
    if (stopped) return
    const now = Date.now()
    if (socket && connectingSince === null) {
      doubted = true
      if (now - lastReceived <= silenceLimit()) return
      abandonConnection()
    }
    if (userWaits) attempt = 0
    if (now - lastAttemptAt < timing.retryNowMs) {
      if (connectingSince === null) scheduleReconnect()
      return
    }
    if (connectingSince !== null) abandonConnection()
    void connect()
  }

  function tick(): void {
    const now = Date.now()
    if (connectingSince !== null) {
      if (now - connectingSince > timing.connectTimeoutMs) abandonConnection()
      return
    }
    if (socket && now - lastReceived > silenceLimit()) {
      // The server went silent: drop the connection and reconnect.
      abandonConnection()
      return
    }
    sendHeartbeatIfDue()
  }

  return {
    /** Whether the server's initial content arrived on the current socket. */
    get synced(): boolean {
      return synced
    },
    send,
    check,
    scheduleReconnect,
    async start(page: { onHidden: () => void }): Promise<void> {
      heartbeat = setInterval(tick, Math.min(timing.heartbeatMs, 1_000))
      stopWatchingPage = watchPage({
        onWake: () => check(true),
        onHidden: page.onHidden,
        onOffline: () => {
          doubted = true
        },
      })
      await connect()
    },
    /** The sync loop runs on this socket. */
    markSynced(): void {
      synced = true
      attempt = 0
    },
    /** Starts over right away, with a fresh backoff. */
    reconnectNow(): void {
      attempt = 0
      void connect()
    },
    /** The next reconnect waits as if this many attempts had failed. */
    holdBackoff(failures: number): void {
      attempt = Math.max(attempt, failures)
    },
    stop(normal: boolean): void {
      stopped = true
      clearReconnectTimer()
      if (heartbeat) clearInterval(heartbeat)
      stopWatchingPage?.()
      const ws = socket
      socket = null
      if (ws && normal) ws.close(1000)
      else ws?.close()
    },
  }
}
