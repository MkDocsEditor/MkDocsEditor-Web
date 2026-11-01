import { ref, shallowRef } from 'vue'

import { ApiError } from '@/api'
import { urlPath } from '@/api/client'
import type { ActorInfo, AuthorshipResponse, WsTicket } from '@/api'

import { applyChangesToRuns, runsFromCodePoints } from './authorRuns'
import type { Run } from './authorRuns'
import type { Automerge } from './automerge'
import type { OfflineStore, StoredCopy } from './offlineStore'
import { rebaseChanges } from './rebase'
import { diffText } from './session'
import type {
  AuthorRun,
  DocumentSession,
  Peer,
  SessionStatus,
  SessionUser,
  TextChange,
  TextSelection,
} from './session'

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

interface DocContent {
  content: string
}
type AmDoc = Automerge.Doc<DocContent>
type AutomergeApi = typeof Automerge

/** The subset of WebSocket the session needs (replaced by a fake in tests). */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number; reason?: string }) => void) | null
  onerror: ((event: unknown) => void) | null
}

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

const OPEN = 1

interface RawPresence {
  clientId: string
  username: string
  displayName?: string
  color?: string
  actorId?: string
  selections?: { anchor: string; head: string }[]
}

interface PeerState {
  info: RawPresence
  resolved: TextSelection[]
}

/** Colour of users the server told nothing about. */
const UNKNOWN_USER_COLOR = '#9e9e9e'

/** Close codes of the document websocket (`docs/sync-protocol.md` section 5). */
const CLOSE_REFUSED = 4003
const CLOSE_DELETED = 4004
const CLOSE_HEARTBEAT_TIMEOUT = 4008
const CLOSE_RENAMED = 4009
const CLOSE_PROTOCOL_ERROR = 4400

/** 16 random bytes as lower-case hex, the format of Automerge actor ids. */
function randomActorId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sameHeads(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((h) => b.includes(h))
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
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as SocketLike)
  let documentId = options.documentId

  const status = ref<SessionStatus>({ connection: 'connecting', readOnly: true, unsynced: false })
  const peers = shallowRef<Peer[]>([])
  const authorship = shallowRef<AuthorRun[]>([])
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
  let release: (() => void) | null = null
  /** Id under which the copy is persisted; stays the old id while a rename cannot take over. */
  let storedId = documentId
  /** The re-keying of the stored copy after `document-renamed`; the reconnect waits for it. */
  let renaming: Promise<void> = Promise.resolve()
  let lastSent = 0
  let lastReceived = 0
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let presenceTimer: ReturnType<typeof setTimeout> | null = null
  let authorshipTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSelections: readonly TextSelection[] = []
  let lastPresenceSent = 0
  const peerStates = new Map<string, PeerState>()
  const users = new Map<string, { displayName: string; color: string }>()
  let runs: Run[] = []
  /** null until the first fetch tells whether the backend has the authorship endpoint. */
  let authorshipSupported: boolean | null = null

  let resolveReady!: () => void
  let rejectReady!: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  ready.catch(() => undefined)
  let isReady = false

  const text = () => doc?.content ?? ''

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

  // ----- persistence ---------------------------------------------------------------------------

  function schedulePersist(): void {
    if (!release || persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      void persist()
    }, timing.persistMs)
  }

  async function persist(): Promise<void> {
    if (!release || !doc || epoch === null) return
    await options.store.put({
      documentId: storedId,
      epoch,
      actorId,
      bytes: A.save(doc),
      serverHeads,
      savedAt: Date.now(),
    })
  }

  // ----- authorship ----------------------------------------------------------------------------

  function publishAuthorship(): void {
    authorship.value = runs.flatMap((run) => {
      if (run.username === null) return []
      const user = users.get(run.username)
      return [
        {
          from: run.from,
          to: run.to,
          username: user?.displayName ?? run.username,
          color: user?.color ?? UNKNOWN_USER_COLOR,
        },
      ]
    })
  }

  async function fetchAuthorship(): Promise<void> {
    if (!doc) return
    let response: AuthorshipResponse | null
    try {
      response = await options.api.getAuthorship(documentId)
    } catch {
      return
    }
    authorshipSupported = response !== null
    if (!response || !doc) return
    if (!sameHeads(response.heads, A.getHeads(doc))) {
      scheduleAuthorshipRefetch() // our copy moved on meanwhile
      return
    }
    runs = runsFromCodePoints(text(), response.runs)
    publishAuthorship()
  }

  function scheduleAuthorshipRefetch(): void {
    if (authorshipSupported === false) return
    if (authorshipTimer) clearTimeout(authorshipTimer)
    authorshipTimer = setTimeout(() => {
      authorshipTimer = null
      void fetchAuthorship()
    }, timing.authorshipRefetchMs)
  }

  // ----- presence ------------------------------------------------------------------------------

  /**
   * Presence cursors (protocol section 6): Automerge cursors, plus the reserved strings `start`
   * (empty text) and `end` (caret after the last character).
   */
  function cursorAt(index: number): string {
    const length = text().length
    if (length === 0) return 'start'
    if (index >= length) return 'end'
    return A.getCursor(doc!, ['content'], Math.max(0, index))
  }

  function cursorPosition(cursor: string): number {
    if (cursor === 'start') return 0
    if (cursor === 'end') return text().length
    return A.getCursorPosition(doc!, ['content'], cursor)
  }

  function resolvePeers(): void {
    if (!doc) return
    const list: Peer[] = []
    for (const state of peerStates.values()) {
      const resolved: TextSelection[] = []
      let ok = true
      for (const s of state.info.selections ?? []) {
        try {
          resolved.push({
            anchor: cursorPosition(s.anchor),
            head: cursorPosition(s.head),
          })
        } catch {
          ok = false // the cursor points into a change we have not received yet
        }
      }
      if (ok) state.resolved = resolved
      list.push({
        clientId: state.info.clientId,
        username: state.info.username,
        displayName: state.info.displayName ?? state.info.username,
        color: state.info.color ?? UNKNOWN_USER_COLOR,
        selections: state.resolved,
      })
    }
    peers.value = list
  }

  function sendPresence(): void {
    presenceTimer = null
    if (!doc || !synced) return
    lastPresenceSent = Date.now()
    send({
      type: 'presence',
      documentId,
      selections: pendingSelections.map((s) => ({
        anchor: cursorAt(s.anchor),
        head: cursorAt(s.head),
      })),
    })
  }

  // ----- websocket -----------------------------------------------------------------------------

  function send(message: Record<string, unknown>): void {
    if (socket?.readyState !== OPEN) return
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
        handleMessage(JSON.parse(String(event.data)) as Record<string, unknown>)
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
    peerStates.clear()
    peers.value = []
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

  function handleMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case 'initial-content':
        onInitialContent(message)
        break
      case 'sync-request':
        onSyncMessage(String(message.syncMessage ?? ''))
        break
      case 'presence': {
        const info = message as unknown as RawPresence
        peerStates.set(info.clientId, {
          info,
          resolved: peerStates.get(info.clientId)?.resolved ?? [],
        })
        resolvePeers()
        break
      }
      case 'presence-snapshot':
        peerStates.clear()
        for (const info of (message.peers as RawPresence[] | undefined) ?? [])
          peerStates.set(info.clientId, { info, resolved: [] })
        resolvePeers()
        break
      case 'presence-leave':
        peerStates.delete(String(message.clientId))
        resolvePeers()
        break
      case 'actor': {
        const info = message as unknown as ActorInfo
        rememberUser(info)
        publishAuthorship()
        break
      }
      case 'document-renamed': {
        const next = String(message.newDocumentId ?? '')
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
   * Moves the persisted copy to the new id (`docs/references.md` section 7). The copy is
   * written under the new id before the old record goes, so a crash leaves two copies, never
   * none. If another tab holds the new id, or a copy of another lineage is stored there, this
   * copy stays under the old id; it syncs with the new id all the same.
   */
  async function followRename(oldId: string, newId: string): Promise<void> {
    if (!release || storedId !== oldId) return
    const next = await options.store.claim(newId)
    if (!next) return
    if (closed || !release) {
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
    storedId = newId
    await persist()
    await options.store.delete(oldId)
    const previous = release
    release = next
    previous()
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

  function rememberUser(info: { username: string; displayName?: string; color?: string }): void {
    if (!info.username) return
    users.set(info.username, {
      displayName: info.displayName || info.username,
      color: info.color ?? users.get(info.username)?.color ?? UNKNOWN_USER_COLOR,
    })
  }

  function onInitialContent(message: Record<string, unknown>): void {
    const serverEpoch = String(message.epoch ?? '')
    readOnly = message.readOnly === true
    const you = message.you as (SessionUser & { username: string }) | undefined
    if (you) {
      me.value = {
        username: you.username,
        displayName: you.displayName || you.username,
        color: you.color,
      }
      rememberUser(you)
    }
    for (const actor of (message.actors as ActorInfo[] | undefined) ?? []) rememberUser(actor)

    const before = text()
    if (doc && epoch === serverEpoch) {
      // Same lineage: keep our copy (with offline edits) and let the sync loop merge.
    } else {
      const loaded = A.load<DocContent>(fromBase64(String(message.documentState ?? '')), {
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
      runs = []
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
    schedulePersist()
    resolvePeers()
    publishAuthorship()
    if (authorshipSupported !== false) void fetchAuthorship()
    if (pendingSelections.length > 0) sendPresence()
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
      runs = applyChangesToRuns(runs, changes, null)
      emit(changes)
      publishAuthorship()
      scheduleAuthorshipRefetch()
      resolvePeers()
      schedulePersist()
    }
    updateUnsynced()
    flush()
  }

  function tick(): void {
    const now = Date.now()
    if (socket?.readyState === OPEN && now - lastReceived > timing.timeoutMs) {
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

  /** Writes a pending change right away when the page is hidden or closed. */
  function persistNow(): void {
    if (!persistTimer) return
    clearTimeout(persistTimer)
    persistTimer = null
    void persist()
  }
  const onHidden = () => {
    if (globalThis.document?.visibilityState !== 'visible') persistNow()
  }

  function shutdown(normal: boolean): void {
    closed = true
    globalThis.removeEventListener?.('pagehide', persistNow)
    globalThis.removeEventListener?.('beforeunload', persistNow)
    globalThis.document?.removeEventListener('visibilitychange', onHidden)
    for (const timer of [reconnectTimer, flushTimer, presenceTimer, authorshipTimer]) {
      if (timer) clearTimeout(timer)
    }
    if (heartbeat) clearInterval(heartbeat)
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    void persist().finally(() => {
      release?.()
      release = null
    })
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
      storedId = documentId
      release = await options.store.claim(documentId)
      const stored = release ? await options.store.get(documentId) : undefined
      if (stored && !closed) {
        adoptStoredCopy(stored)
      }
    } catch (error) {
      console.error('mkdocseditor: could not load the local copy', error)
    }
    if (closed) return
    globalThis.addEventListener?.('pagehide', persistNow)
    globalThis.addEventListener?.('beforeunload', persistNow)
    globalThis.document?.addEventListener('visibilitychange', onHidden)
    heartbeat = setInterval(tick, Math.min(timing.heartbeatMs, 1_000))
    await connect()
  }

  void start()

  return {
    status,
    peers,
    authorship,
    me,
    ready,
    getText: text,
    applyLocalChanges(changes) {
      if (!doc || changes.length === 0) return
      if (readOnly || status.value.connection === 'closed') return
      doc = A.change(doc, (d) => {
        for (const c of changes) A.splice(d, ['content'], c.from, c.to - c.from, c.insert)
      })
      runs = applyChangesToRuns(runs, changes, me.value?.username ?? null)
      publishAuthorship()
      updateUnsynced()
      scheduleFlush()
      schedulePersist()
      if (peerStates.size > 0) resolvePeers()
    },
    setLocalSelections(selections) {
      pendingSelections = selections
      if (presenceTimer) return
      const wait = Math.max(0, timing.presenceMs - (Date.now() - lastPresenceSent))
      presenceTimer = setTimeout(sendPresence, wait)
    },
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
