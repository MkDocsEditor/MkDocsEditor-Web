import { ref, shallowRef } from 'vue'

import { ApiError } from '@/api'
import { urlPath } from '@/api/client'
import type { AuthorshipResponse, WsTicket } from '@/api'

import { createAuthors } from './authors'
import { sameHeads } from './automerge'
import type { AmDoc, Automerge, AutomergeApi, DocContent } from './automerge'
import type { OfflineStore, StoredCopy } from './offlineStore'
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
  flushMs: 50,
  presenceMs: 100,
  persistMs: 300,
  authorshipRefetchMs: 3_000,
  backoffMs: [500, 1_000, 2_000, 5_000, 10_000, 15_000],
}

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
  /** The re-keying of the stored copy after `document-renamed`; the reconnect waits for it. */
  let renaming: Promise<void> = Promise.resolve()
  let lastSent = 0
  let lastReceived = 0
  let heartbeat: ReturnType<typeof setInterval> | null = null
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
      doc && epoch !== null ? { epoch, actorId, bytes: A.save(doc), serverHeads } : null,
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

  function scheduleFlush(): void {
    flushTimer ??= setTimeout(flush, timing.flushMs)
  }

  async function connect(): Promise<void> {
    if (closed) return
    setStatus({ connection: doc || attempt > 0 ? 'offline' : 'connecting' })
    let ticket: WsTicket
    try {
      ticket = await options.api.wsTicket()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        fail('Please sign in again to keep editing.')
        return
      }
      scheduleReconnect()
      return
    }
    if (closed) return

    const ws = createSocket(options.api.wsUrl(urlPath`/document/${documentId}/ws`))
    socket = ws
    synced = false
    ws.onopen = () => {
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
      try {
        handleMessage(JSON.parse(String(event.data)) as ServerMessage)
      } catch (error) {
        console.error('mkdocseditor: bad sync message', error)
      }
    }
    ws.onerror = () => undefined
    ws.onclose = (event) => {
      if (socket !== ws) return
      socket = null
      synced = false
      handleClose(event.code)
    }
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
        fail('The server refused this connection.')
        return
      case CLOSE_DELETED:
        fail('This page was deleted. Your text is still here – copy it if you want to keep it.')
        return
      case CLOSE_PROTOCOL_ERROR:
        fail('Connection error (protocol). Please reload the page.')
        return
      case CLOSE_RENAMED:
        // reconnect with the new id once the stored copy follows (its epoch goes into hello)
        attempt = 0
        void renaming.finally(() => connect())
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
        if (message.code === 'read-only') setStatus({ readOnly: true })
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
    readOnly = false
    setStatus({ readOnly: false })
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
    serverHeads = [...nextState.sharedHeads]
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
    if (socket?.readyState === SOCKET_OPEN && now - lastReceived > timing.timeoutMs) {
      // The server went silent: drop the connection and reconnect.
      const stale = socket
      socket = null
      synced = false
      stale.close(CLOSE_HEARTBEAT_TIMEOUT, 'heartbeat timeout')
      handleClose(CLOSE_HEARTBEAT_TIMEOUT)
      return
    }
    if (synced && now - lastSent >= timing.heartbeatMs) send({ type: 'heartbeat' })
  }

  function shutdown(normal: boolean): void {
    closed = true
    for (const timer of [reconnectTimer, flushTimer]) {
      if (timer) clearTimeout(timer)
    }
    presence.stop()
    authors.stop()
    if (heartbeat) clearInterval(heartbeat)
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
