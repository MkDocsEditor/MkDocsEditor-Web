import { ref, shallowRef } from 'vue'

import { ApiError } from '@/api'
import { urlPath } from '@/api/client'
import type { AuthorshipResponse, WsTicket } from '@/api'

import { createAuthors } from './authors'
import { sameHeads } from './automerge'
import type { AmDoc, Automerge, AutomergeApi, DocContent } from './automerge'
import type { OfflineStore, StoredCopy } from './offlineStore'
import { watchPage } from './pageEvents'
import { createPresence } from './presence'
import { fromBase64, toBase64 } from './protocol'
import type { ServerMessage } from './protocol'
import { rebaseChanges } from './rebase'
import {
  CLOSE_DELETED,
  CLOSE_HEARTBEAT_TIMEOUT,
  CLOSE_PROTOCOL_ERROR,
  CLOSE_REFUSED,
  CLOSE_RENAMED,
  SOCKET_OPEN,
  browserSocket,
} from './socket'
import type { SocketLike } from './socket'
import { diffText } from './session'
import type { DocumentSession, SessionStatus, SessionUser, TextChange } from './session'
import { createStoredCopy } from './storedCopy'

/**
 * Live collaborative editing over the backend's document websocket, as specified in
 * `docs/sync-protocol.md` of MkDocsEditor-Backend (version 1):
 *
 * - `hello` with the actor id of this document copy and a single-use ticket,
 * - `initial-content` (epoch, document state, actors, own user, read-only flag),
 * - the standard Automerge sync loop with one sync state per connection,
 * - presence with Automerge cursors, heartbeats, close codes,
 * - the local copy is persisted (with its actor id, epoch and server heads), so edits survive
 *   reloads and offline periods, even when the server starts a new epoch.
 */

export interface SessionApi {
  wsTicket(): Promise<WsTicket>
  wsUrl(path: string): string
  getAuthorship(id: string): Promise<AuthorshipResponse | null>
  getDocument(id: string): Promise<unknown>
}

export interface AutomergeSessionOptions {
  documentId: string
  /** The Automerge API, or a promise of it (the WebAssembly module loads lazily). */
  automerge: AutomergeApi | Promise<AutomergeApi>
  api: SessionApi
  store: OfflineStore
  createSocket?: (url: string) => SocketLike
  /** Called when the server reports a rename; the session follows the new id itself. */
  onRenamed?: (newDocumentId: string) => void
  timing?: Partial<typeof DEFAULT_TIMING>
  clientName?: string
}

const DEFAULT_TIMING = {
  heartbeatMs: 5_000,
  timeoutMs: 15_000,
  /**
   * Silence that already means a dead connection when there is a reason to doubt it (the page
   * woke up, the network changed, the user types): the server sends something every 5 s.
   */
  doubtMs: 8_000,
  /** How long the ticket request, and then the socket until it opens, may take. */
  connectTimeoutMs: 10_000,
  /** A wake-up or a keystroke starts a new connection attempt at most this often. */
  retryNowMs: 2_000,
  flushMs: 50,
  presenceMs: 100,
  persistMs: 300,
  authorshipRefetchMs: 3_000,
  backoffMs: [500, 1_000, 2_000, 5_000, 10_000, 15_000],
}

const SYNC_FAILURES_FORGOTTEN_MS = 60_000

const DELETED_MESSAGE =
  'This page was deleted. Your text is still here – copy it if you want to keep it.'

/** 16 random bytes as lower-case hex, the format of Automerge actor ids. */
function randomActorId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Converts Automerge patches on `content` to sequential TextChanges, or null if unexpected. */
function patchesToChanges(patches: readonly Automerge.Patch[]): TextChange[] | null {
  const changes: TextChange[] = []
  for (const patch of patches) {
    if (patch.path[0] !== 'content') continue
    const index = patch.path[1]
    if (patch.path.length !== 2 || typeof index !== 'number') return null
    if (patch.action === 'splice') changes.push({ from: index, to: index, insert: patch.value })
    else if (patch.action === 'del')
      changes.push({ from: index, to: index + (patch.length ?? 1), insert: '' })
    else return null
  }
  return changes
}

export function createAutomergeSession(options: AutomergeSessionOptions): DocumentSession {
  // Assigned in start(); every use happens after a document exists.
  let A!: AutomergeApi
  const timing = { ...DEFAULT_TIMING, ...options.timing }
  const createSocket = options.createSocket ?? browserSocket
  let documentId = options.documentId

  const status = ref<SessionStatus>({ connection: 'connecting', readOnly: true, unsynced: false })
  const me = shallowRef<SessionUser | null>(null)
  const listeners = new Set<(changes: readonly TextChange[]) => void>()

  let doc: AmDoc | null = null
  let actorId = randomActorId()
  let epoch: string | null = null
  let serverHeads: string[] = []
  let syncState: Automerge.SyncState | null = null
  let readOnly = false
  let socket: SocketLike | null = null
  let synced = false // received initial-content on the current socket
  let closed = false
  let attempt = 0
  /** Numbers the connection attempts, so that an abandoned one can tell. */
  let attemptId = 0
  /** Since when the current attempt waits for its ticket or its socket; null if it is not. */
  let connectingSince: number | null = null
  let lastAttemptAt = 0
  /** There is a reason to doubt that the open socket still works; any message settles it. */
  let doubted = false
  /** Sync messages in a row that could not be applied, counted from 0. */
  let syncFailures = 0
  let lastSyncFailureAt = 0
  /** The error message of the server on the current socket; a fatal one precedes the close. */
  let serverError: string | undefined
  /** The server closed with 4003 and did not accept a connection since. */
  let refused = false
  /** The re-keying of the stored copy after `document-renamed`; the reconnect waits for it. */
  let renaming: Promise<void> = Promise.resolve()
  let lastSent = 0
  let lastReceived = 0
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let stopWatchingPage: (() => void) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let resolveReady!: () => void
  let rejectReady!: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  ready.catch(() => undefined)
  let isReady = false

  const text = () => doc?.content ?? ''

  const copy = createStoredCopy({
    store: options.store,
    persistMs: timing.persistMs,
    snapshot: () =>
      doc && epoch !== null ? { epoch, actorId, bytes: A.save(doc), serverHeads, readOnly } : null,
  })
  const presence = createPresence({
    automerge: () => A,
    doc: () => doc,
    documentId: () => documentId,
    isSynced: () => synced,
    send,
    presenceMs: timing.presenceMs,
  })
  const authors = createAuthors({
    automerge: () => A,
    doc: () => doc,
    documentId: () => documentId,
    getAuthorship: (id) => options.api.getAuthorship(id),
    refetchMs: timing.authorshipRefetchMs,
  })

  function setStatus(patch: Partial<SessionStatus>): void {
    status.value = { ...status.value, ...patch }
  }

  function updateUnsynced(): void {
    const unsynced = doc ? !sameHeads(A.getHeads(doc), serverHeads) : false
    if (unsynced !== status.value.unsynced) setStatus({ unsynced })
  }

  function emit(changes: readonly TextChange[]): void {
    if (changes.length === 0) return
    for (const listener of listeners) listener(changes)
  }

  function markReady(): void {
    if (isReady) return
    isReady = true
    resolveReady()
  }

  // ----- websocket -----------------------------------------------------------------------------

  function send(message: Record<string, unknown>): void {
    if (socket?.readyState !== SOCKET_OPEN) return
    socket.send(JSON.stringify(message))
    lastSent = Date.now()
  }

  function flush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (!doc || !syncState || !synced) return
    let state: Automerge.SyncState = syncState
    for (;;) {
      const [nextState, message]: [Automerge.SyncState, Uint8Array | null] = A.generateSyncMessage(
        doc,
        state,
      )
      state = nextState
      if (!message) break
      send({ type: 'sync-request', documentId, syncMessage: toBase64(message) })
    }
    syncState = state
  }

  /**
   * Browsers throttle the timers of a background tab to one wake-up per minute, but still deliver
   * websocket messages. So the server's own heartbeats drive ours too; on `tick` alone the server
   * would close the connection of a background tab after 15 s (`4008`).
   */
  function sendHeartbeatIfDue(): void {
    if (synced && Date.now() - lastSent >= timing.heartbeatMs) send({ type: 'heartbeat' })
  }

  function scheduleFlush(): void {
    flushTimer ??= setTimeout(flush, timing.flushMs)
  }

  async function connect(): Promise<void> {
    if (closed) return
    const id = ++attemptId
    const abandoned = () => closed || id !== attemptId
    clearReconnectTimer()
    connectingSince = lastAttemptAt = Date.now()
    setStatus({ connection: doc || attempt > 0 ? 'offline' : 'connecting' })
    // the stored copy follows a rename first (its epoch goes into hello)
    await renaming
    if (abandoned()) return
    let ticket: WsTicket
    try {
      ticket = await options.api.wsTicket()
    } catch (error) {
      if (abandoned()) return
      connectingSince = null
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        fail('Please sign in again to keep editing.')
        return
      }
      scheduleReconnect()
      return
    }
    if (abandoned()) return

    let ws: SocketLike
    try {
      ws = createSocket(options.api.wsUrl(urlPath`/document/${documentId}/ws`))
    } catch (error) {
      console.error('mkdocseditor: could not open the websocket', error)
      connectingSince = null
      scheduleReconnect()
      return
    }
    connectingSince = Date.now()
    socket = ws
    synced = false
    serverError = undefined
    let opened = false
    ws.onopen = () => {
      if (socket !== ws) return
      opened = true
      connectingSince = null
      lastReceived = Date.now()
      const hello: Record<string, unknown> = {
        type: 'hello',
        documentId,
        actorId,
        ticket: ticket.ticket,
        client: options.clientName ?? 'MkDocsEditor-Web',
      }
      if (doc && epoch) hello.epoch = epoch
      send(hello)
    }
    ws.onmessage = (event) => {
      if (socket !== ws) return
      lastReceived = Date.now()
      doubted = false
      let message: ServerMessage | undefined
      try {
        message = JSON.parse(String(event.data)) as ServerMessage
        handleMessage(message)
      } catch (error) {
        console.error('mkdocseditor: bad sync message', error)
        if (message?.type === 'initial-content' || message?.type === 'sync-request') {
          // The sync loop cannot go on from here, and a new connection starts it over. The
          // initial content resets the backoff, so failures in a row have to keep it up.
          const now = Date.now()
          syncFailures = now - lastSyncFailureAt < SYNC_FAILURES_FORGOTTEN_MS ? syncFailures + 1 : 0
          lastSyncFailureAt = now
          attempt = Math.max(attempt, syncFailures)
          abandonConnection()
          return
        }
      }
      sendHeartbeatIfDue()
    }
    ws.onerror = () => undefined
    ws.onclose = (event) => {
      if (socket !== ws) return
      socket = null
      synced = false
      connectingSince = null
      handleClose(event.code)
      // The ticket came, so the server is there, but it refused the upgrade: browsers do not tell
      // why. Asking is the only way to notice a page that was deleted while we were away.
      if (!opened && !closed) void checkDocumentExists()
    }
  }

  async function checkDocumentExists(): Promise<void> {
    try {
      await options.api.getDocument(documentId)
    } catch (error) {
      if (!closed && error instanceof ApiError && error.status === 404 && !error.movedTo) {
        fail(doc ? DELETED_MESSAGE : 'This page does not exist any more.')
      }
    }
  }

  /**
   * The server does not accept the actor id of this copy for this user, for example when another
   * account used this browser before. The next connection starts on the server's document with a
   * new actor, and unsynced edits are re-applied like after a new epoch.
   */
  function forgetActor(): void {
    actorId = randomActorId()
    epoch = null
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return
    setStatus({ connection: doc ? 'offline' : 'connecting' })
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
    handleClose(CLOSE_HEARTBEAT_TIMEOUT)
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
  function checkConnection(userWaits: boolean): void {
    if (closed) return
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

  function fail(message: string): void {
    setStatus({ connection: 'closed', readOnly: true, message })
    shutdown(false)
    if (!isReady) rejectReady(new Error(message))
  }

  function handleClose(code: number): void {
    presence.clear()
    if (closed) return
    switch (code) {
      case CLOSE_REFUSED:
        // A changed role also closes with 4003, and the next connection applies it. A second
        // refusal in a row means that the server really does not want this connection.
        if (refused) {
          fail('The server refused this connection.')
          return
        }
        refused = true
        if (serverError === 'foreign-actor') forgetActor()
        scheduleReconnect()
        return
      case CLOSE_DELETED:
        fail(DELETED_MESSAGE)
        return
      case CLOSE_PROTOCOL_ERROR:
        fail('Connection error (protocol). Please reload the page.')
        return
      case CLOSE_RENAMED:
        // reconnect with the new id
        attempt = 0
        void connect()
        return
      default:
        scheduleReconnect()
    }
  }

  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'initial-content':
        onInitialContent(message)
        break
      case 'sync-request':
        onSyncMessage(message.syncMessage ?? '')
        break
      case 'presence':
        presence.update(message)
        break
      case 'presence-snapshot':
        presence.replaceAll(message.peers ?? [])
        break
      case 'presence-leave':
        presence.remove(message.clientId)
        break
      case 'actor':
        authors.rememberUser(message)
        authors.publish()
        break
      case 'document-renamed': {
        const next = message.newDocumentId ?? ''
        if (next) {
          const old = documentId
          documentId = next
          renaming = followRename(old, next).catch((error: unknown) =>
            console.error('mkdocseditor: could not move the local copy', error),
          )
          options.onRenamed?.(next)
        }
        break
      }
      case 'document-deleted':
        // the close frame (4004) follows
        break
      case 'error':
        serverError = message.code
        if (message.code === 'read-only') {
          // It only says so when it gets changes, which stay in this copy (a role that changed
          // while offline, for example).
          readOnly = true
          setStatus({
            readOnly: true,
            message: 'You can only read this page. Your changes here were not saved.',
          })
        }
        break
      default:
      // heartbeat and unknown types
    }
  }

  /**
   * Moves the persisted copy to the new id (`docs/references.md` section 7). If another tab holds the new id, or a copy of another lineage is stored there, this
   * copy stays under the old id; it syncs with the new id all the same.
   */
  async function followRename(oldId: string, newId: string): Promise<void> {
    if (!copy.isStoredAs(oldId)) return
    const next = await options.store.claim(newId)
    if (!next) return
    if (closed || !copy.claimed) {
      next()
      return
    }
    const existing = await options.store.get(newId)
    if (existing && !doc) {
      // No copy under the old id (it was re-keyed already, for example by the tree's rescue of
      // moved copies): continue with the stored copy of the new id, like on start.
      adoptStoredCopy(existing)
    } else if (existing && existing.epoch !== epoch) {
      next()
      return
    } else if (existing && doc) {
      // An older copy of the same document under the new id: keep its edits too.
      const before = text()
      doc = A.merge(doc, A.load<DocContent>(existing.bytes, { actor: existing.actorId }))
      emit(diffText(before, text()))
      updateUnsynced()
      scheduleFlush()
    }
    await copy.moveTo(newId, next)
  }

  /** Editing works offline on a persisted copy; the server merges it after the reconnect. */
  function adoptStoredCopy(stored: StoredCopy): void {
    doc = A.load<DocContent>(stored.bytes, { actor: stored.actorId })
    actorId = stored.actorId
    epoch = stored.epoch
    serverHeads = stored.serverHeads
    readOnly = stored.readOnly ?? false
    setStatus({ readOnly })
    emit(diffText('', text()))
    updateUnsynced()
    markReady()
  }

  function onInitialContent(message: Extract<ServerMessage, { type: 'initial-content' }>): void {
    const serverEpoch = message.epoch ?? ''
    readOnly = message.readOnly === true
    const you = message.you
    if (you) {
      me.value = {
        username: you.username,
        displayName: you.displayName || you.username,
        color: you.color,
      }
      authors.rememberUser(you)
    }
    for (const actor of message.actors ?? []) authors.rememberUser(actor)

    const before = text()
    if (doc && epoch === serverEpoch) {
      // Same lineage: keep our copy (with offline edits) and let the sync loop merge.
    } else {
      const loaded = A.load<DocContent>(fromBase64(message.documentState ?? ''), {
        actor: doc ? randomActorId() : actorId,
      })
      let next = loaded
      if (doc) {
        // The server started a new epoch: re-apply our unsynced edits onto its new document.
        const base = serverHeads.length > 0 ? A.view(doc, serverHeads).content : doc.content
        const unsynced = diffText(base, doc.content)
        const rebased = rebaseChanges(base, unsynced, loaded.content)
        if (rebased.length > 0) {
          next = A.change(loaded, (d) => {
            for (const c of rebased) A.splice(d, ['content'], c.from, c.to - c.from, c.insert)
          })
        }
      }
      actorId = A.getActorId(next)
      serverHeads = A.getHeads(loaded)
      doc = next
      epoch = serverEpoch
      authors.reset()
      emit(diffText(before, text()))
    }

    syncState = A.initSyncState()
    synced = true
    attempt = 0
    refused = false
    setStatus({
      connection: 'online',
      readOnly,
      message: readOnly ? 'You can only read this page.' : undefined,
    })
    updateUnsynced()
    markReady()
    flush()
    copy.schedule()
    presence.resolve()
    authors.publish()
    authors.refresh()
    presence.sendCurrent()
  }

  function onSyncMessage(encoded: string): void {
    if (!doc || !syncState) return
    const before = doc
    const [nextDoc, nextState] = A.receiveSyncMessage(doc, syncState, fromBase64(encoded))
    doc = nextDoc
    syncState = nextState
    // Empty while the first round of a new sync state runs. That says nothing about the server,
    // and without heads a new epoch could not tell the unsynced edits any more.
    if (nextState.sharedHeads.length > 0) serverHeads = [...nextState.sharedHeads]
    const beforeHeads = A.getHeads(before)
    const afterHeads = A.getHeads(doc)
    if (!sameHeads(beforeHeads, afterHeads)) {
      const changes =
        patchesToChanges(A.diff(doc, beforeHeads, afterHeads)) ??
        diffText(before.content, doc.content)
      authors.follow(changes, null)
      emit(changes)
      authors.publish()
      authors.scheduleRefetch()
      presence.resolve()
      copy.schedule()
    }
    updateUnsynced()
    flush()
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

  function shutdown(normal: boolean): void {
    closed = true
    for (const timer of [reconnectTimer, flushTimer]) {
      if (timer) clearTimeout(timer)
    }
    presence.stop()
    authors.stop()
    if (heartbeat) clearInterval(heartbeat)
    stopWatchingPage?.()
    copy.close()
    const ws = socket
    socket = null
    if (ws && normal) ws.close(1000)
    else ws?.close()
  }

  async function start(): Promise<void> {
    try {
      A = await options.automerge
    } catch (error) {
      fail('Could not load the editor.')
      console.error(error)
      return
    }
    try {
      const stored = await copy.open(documentId)
      if (stored && !closed) {
        adoptStoredCopy(stored)
      }
    } catch (error) {
      console.error('mkdocseditor: could not load the local copy', error)
    }
    if (closed) return
    copy.watchPage()
    heartbeat = setInterval(tick, Math.min(timing.heartbeatMs, 1_000))
    stopWatchingPage = watchPage({
      onWake: () => checkConnection(true),
      // a timer would run late in the background
      onHidden: flush,
      onOffline: () => {
        doubted = true
      },
    })
    await connect()
  }

  void start()

  return {
    status,
    peers: presence.peers,
    authorship: authors.authorship,
    me,
    ready,
    getText: text,
    applyLocalChanges(changes) {
      if (!doc || changes.length === 0) return
      if (readOnly || status.value.connection === 'closed') return
      doc = A.change(doc, (d) => {
        for (const c of changes) A.splice(d, ['content'], c.from, c.to - c.from, c.insert)
      })
      authors.follow(changes, me.value?.username ?? null)
      authors.publish()
      updateUnsynced()
      scheduleFlush()
      copy.schedule()
      presence.onLocalEdit()
      checkConnection(false)
    },
    setLocalSelections: presence.setLocalSelections,
    onRemoteChanges(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      if (closed) return
      flush()
      listeners.clear()
      shutdown(true)
    },
  }
}
