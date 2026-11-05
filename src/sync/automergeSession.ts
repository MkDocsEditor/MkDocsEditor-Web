import { ref, shallowRef } from 'vue'

import { ApiError } from '@/api'
import type { AuthorshipResponse, WsTicket } from '@/api'

import { createAuthors } from './authors'
import { createConnection } from './connection'
import { sameHeads } from './automerge'
import type { AmDoc, Automerge, AutomergeApi, DocContent } from './automerge'
import type { OfflineStore, StoredCopy } from './offlineStore'
import { createPresence } from './presence'
import { fromBase64, toBase64 } from './protocol'
import type { ServerMessage } from './protocol'
import { rebaseChanges } from './rebase'
import { CLOSE_DELETED, CLOSE_PROTOCOL_ERROR, CLOSE_REFUSED, CLOSE_RENAMED } from './socket'
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
  /** Records of older versions without an owner, used until the server tells whose they are. */
  unowned?: OfflineStore
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
  /** How often a tab without the stored copy tries again to claim it, while there are changes. */
  retryClaimMs: 5_000,
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
  let closed = false
  /** Sync messages in a row that could not be applied, counted from 0. */
  let syncFailures = 0
  let lastSyncFailureAt = 0
  /** The error message of the server on the current socket; a fatal one precedes the close. */
  let serverError: string | undefined
  /** The server closed with 4003 and did not accept a connection since. */
  let refused = false
  /** The next initial content replaces the local copy, because its edits are not ours to send. */
  let discardLocalEdits = false
  /** The re-keying of the stored copy after `document-renamed`; the reconnect waits for it. */
  let renaming: Promise<void> = Promise.resolve()
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
    unowned: options.unowned,
    persistMs: timing.persistMs,
    retryClaimMs: timing.retryClaimMs,
    documentId: () => documentId,
    snapshot: () =>
      doc && epoch !== null && !copy.isUnowned
        ? { epoch, actorId, bytes: A.save(doc), serverHeads, readOnly }
        : null,
    onLateClaim: (existing) => !existing || mergeStoredCopy(existing),
  })
  const connection = createConnection({
    timing,
    createSocket: options.createSocket,
    api: options.api,
    documentId: () => documentId,
    hasDocument: () => doc !== null,
    beforeConnect: () => renaming,
    hello: (ticket) => {
      const hello: Record<string, unknown> = {
        type: 'hello',
        documentId,
        actorId,
        ticket,
        client: options.clientName ?? 'MkDocsEditor-Web',
      }
      if (doc && epoch) hello.epoch = epoch
      return hello
    },
    onState: (state) => setStatus({ connection: state }),
    onNewSocket: () => {
      serverError = undefined
    },
    onMessage: receive,
    onClose: handleClose,
    onSignedOut: () => fail('Please sign in again to keep editing.'),
    onUpgradeRefused: () => void checkDocumentExists(),
  })
  const send = connection.send
  const presence = createPresence({
    automerge: () => A,
    doc: () => doc,
    documentId: () => documentId,
    isSynced: () => connection.synced,
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

  function flush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (!doc || !syncState || !connection.synced) return
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

  /**
   * Handles what the server sent. Returns false when the sync loop cannot go on from here, and a
   * new connection has to start it over.
   */
  function receive(data: unknown): boolean {
    let message: ServerMessage | undefined
    try {
      message = JSON.parse(String(data)) as ServerMessage
      handleMessage(message)
    } catch (error) {
      console.error('mkdocseditor: bad sync message', error)
      if (message?.type === 'initial-content' || message?.type === 'sync-request') {
        // The initial content resets the backoff, so failures in a row have to keep it up.
        const now = Date.now()
        syncFailures = now - lastSyncFailureAt < SYNC_FAILURES_FORGOTTEN_MS ? syncFailures + 1 : 0
        lastSyncFailureAt = now
        connection.holdBackoff(syncFailures)
        return false
      }
    }
    return true
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
   * The server does not accept the actor id of this copy for this user. Its unsynced edits are
   * someone else's, so they must not be published here: the next connection starts on the server's
   * document with a new actor. A record without an owner stays where it is, for its owner. Any
   * other copy is set aside, where nothing reads it any more.
   */
  function forgetActor(): void {
    if (copy.isUnowned) copy.leaveUnowned()
    else if (status.value.unsynced) void copy.setAside()
    actorId = randomActorId()
    epoch = null
    discardLocalEdits = true
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
        connection.scheduleReconnect()
        return
      case CLOSE_DELETED:
        fail(DELETED_MESSAGE)
        return
      case CLOSE_PROTOCOL_ERROR:
        fail('Connection error (protocol). Please reload the page.')
        return
      case CLOSE_RENAMED:
        // reconnect with the new id
        connection.reconnectNow()
        return
      default:
        connection.scheduleReconnect()
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
        presence.replaceAll(message.peers ?? [], message.lastPositions ?? [])
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
    } else if (existing && !mergeStoredCopy(existing)) {
      next()
      return
    }
    await copy.moveTo(newId, next)
  }

  /**
   * Merges another stored copy of this document, so that its edits are kept. Returns false for a
   * copy of another lineage, which stays as it is.
   */
  function mergeStoredCopy(existing: StoredCopy): boolean {
    if (!doc || existing.epoch !== epoch) return false
    const before = text()
    doc = A.merge(doc, A.load<DocContent>(existing.bytes, { actor: existing.actorId }))
    emit(diffText(before, text()))
    updateUnsynced()
    scheduleFlush()
    return true
  }

  /** Editing works offline on a persisted copy; the server merges it after the reconnect. */
  function adoptStoredCopy(stored: StoredCopy): void {
    doc = A.load<DocContent>(stored.bytes, { actor: stored.actorId })
    actorId = stored.actorId
    epoch = stored.epoch
    serverHeads = stored.serverHeads
    readOnly = stored.readOnly ?? false
    setStatus({ readOnly })
    if (copy.isUnowned) {
      // Edits here might end up with the wrong account if the record is someone else's.
      readOnly = true
      setStatus({
        readOnly: true,
        message: 'This local copy comes from an older version. It can be edited once it is online.',
      })
    }
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
      if (doc && !discardLocalEdits) {
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
      discardLocalEdits = false
      emit(diffText(before, text()))
    }

    syncState = A.initSyncState()
    connection.markSynced()
    refused = false
    setStatus({
      connection: 'online',
      readOnly,
      message: readOnly ? 'You can only read this page.' : undefined,
    })
    updateUnsynced()
    markReady()
    flush()
    if (copy.isUnowned) void copy.keepUnowned()
    else copy.schedule()
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

  function shutdown(normal: boolean): void {
    closed = true
    if (flushTimer) clearTimeout(flushTimer)
    presence.stop()
    authors.stop()
    copy.close()
    connection.stop(normal)
  }

  async function start(): Promise<void> {
    try {
      A = await options.automerge
    } catch (error) {
      fail('Could not load the editor.')
      console.error(error)
      return
    }
    if (closed) return
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
    // a timer would run late in the background
    await connection.start({ onHidden: flush })
  }

  void start()

  return {
    status,
    peers: presence.peers,
    lastPositionOf: presence.lastPositionOf,
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
      connection.check(false)
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
