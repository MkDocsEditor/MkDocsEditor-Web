import type { Automerge } from '@/sync/automerge'
import type { SessionApi, SocketLike } from '@/sync/automergeSession'

type AmDoc = Automerge.Doc<{ content: string }>
type Api = typeof Automerge

interface Connection {
  socket: FakeSocket
  syncState: Automerge.SyncState | null
  clientId: string
  user: { username: string; displayName: string; color: string; role: string }
  helloReceived: boolean
}

let nextClient = 1

/** The client side of an in-memory websocket to the fake server. */
export class FakeSocket implements SocketLike {
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number; reason?: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  readonly sent: Record<string, unknown>[] = []

  constructor(private readonly server: FakeSyncServer) {
    setTimeout(() => {
      if (this.readyState !== 0) return
      this.readyState = 1
      this.onopen?.({})
    }, 0)
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('socket not open')
    const message = JSON.parse(data) as Record<string, unknown>
    this.sent.push(message)
    setTimeout(() => this.server.receive(this, message), 0)
  }

  /** Called by the client. */
  close(code = 1000): void {
    if (this.readyState >= 2) return
    this.readyState = 3
    this.server.drop(this)
    setTimeout(() => this.onclose?.({ code }), 0)
  }

  /** Called by the server. */
  serverClose(code: number): void {
    if (this.readyState >= 2) return
    this.readyState = 3
    setTimeout(() => this.onclose?.({ code }), 0)
  }

  deliver(message: Record<string, unknown>): void {
    if (this.readyState !== 1) return
    setTimeout(() => {
      if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(message) })
    }, 0)
  }
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * An in-memory implementation of the backend's document websocket protocol (v1), enough to
 * test the client: one authoritative document, one sync state per connection, presence relay.
 */
export class FakeSyncServer {
  doc: AmDoc
  epoch = 'epoch-1'
  readonly connections: Connection[] = []
  /** When true, new sockets fail like an unreachable server. */
  offline = false
  readOnlyUsers = new Set<string>()
  ticketsIssued = 0
  /** Old ids of the document (renames), answered with `document-renamed` after hello. */
  readonly oldIds = new Set<string>()

  constructor(
    private readonly A: Api,
    initialText: string,
    public documentId = 'doc-1',
  ) {
    this.doc = this.fresh(initialText)
  }

  private fresh(text: string): AmDoc {
    return this.A.change(
      this.A.init<{ content: string }>({ actor: '00'.repeat(15) + '02' }),
      (d) => {
        d.content = text
      },
    )
  }

  get text(): string {
    return this.doc.content
  }

  /** The API a session needs, for one user. */
  api(username: string): SessionApi {
    return {
      wsTicket: async () => {
        if (this.offline) throw Object.assign(new Error('offline'), { status: 0 })
        this.ticketsIssued++
        return { ticket: `ticket-${username}` }
      },
      wsUrl: (path) => `ws://fake${path}`,
      getAuthorship: async () => null,
    }
  }

  socketFactory = (): FakeSocket => {
    const socket = new FakeSocket(this)
    if (this.offline) {
      setTimeout(() => socket.serverClose(1006), 0)
      socket.readyState = 3
    }
    return socket
  }

  receive(socket: FakeSocket, message: Record<string, unknown>): void {
    let connection = this.connections.find((c) => c.socket === socket)
    if (message.type === 'hello' && this.oldIds.has(String(message.documentId))) {
      socket.deliver({
        type: 'document-renamed',
        documentId: message.documentId,
        newDocumentId: this.documentId,
      })
      setTimeout(() => socket.serverClose(4009), 0)
      return
    }
    if (message.type === 'hello') {
      const username = String(message.ticket).replace('ticket-', '')
      connection = {
        socket,
        syncState: this.A.initSyncState(),
        clientId: `c-${nextClient++}`,
        user: {
          username,
          displayName: username.charAt(0).toUpperCase() + username.slice(1),
          color: username === 'anna' ? '#1971c2' : '#e8590c',
          role: this.readOnlyUsers.has(username) ? 'reader' : 'editor',
        },
        helloReceived: true,
      }
      this.connections.push(connection)
      socket.deliver({
        type: 'initial-content',
        documentId: this.documentId,
        epoch: this.epoch,
        documentState: b64(this.A.save(this.doc)),
        content: this.doc.content,
        readOnly: this.readOnlyUsers.has(username),
        you: { clientId: connection.clientId, ...connection.user },
        actors: [],
      })
      socket.deliver({
        type: 'presence-snapshot',
        documentId: this.documentId,
        peers: this.connections
          .filter((c) => c !== connection)
          .map((c) => ({ clientId: c.clientId, ...c.user, selections: [] })),
      })
      return
    }
    if (!connection) {
      socket.serverClose(4400)
      return
    }
    if (message.type === 'sync-request') {
      const bytes = new Uint8Array(Buffer.from(String(message.syncMessage), 'base64'))
      if (this.readOnlyUsers.has(connection.user.username)) {
        // readers sync against a shadow in the real server; here we just ignore their changes
        const [, state] = this.A.receiveSyncMessage(
          this.A.clone(this.doc),
          connection.syncState!,
          bytes,
        )
        connection.syncState = state
        socket.deliver({ type: 'error', code: 'read-only', message: 'read only' })
      } else {
        const [doc, state] = this.A.receiveSyncMessage(this.doc, connection.syncState!, bytes)
        this.doc = doc
        connection.syncState = state
      }
      this.syncAll()
    } else if (message.type === 'presence') {
      for (const other of this.connections) {
        if (other === connection) continue
        other.socket.deliver({
          ...message,
          clientId: connection.clientId,
          ...connection.user,
        })
      }
    }
  }

  syncAll(): void {
    for (const connection of this.connections) {
      for (;;) {
        const [state, msg] = this.A.generateSyncMessage(this.doc, connection.syncState!)
        connection.syncState = state
        if (!msg) break
        connection.socket.deliver({
          type: 'sync-request',
          documentId: this.documentId,
          syncMessage: b64(msg),
        })
      }
    }
  }

  drop(socket: FakeSocket): void {
    const index = this.connections.findIndex((c) => c.socket === socket)
    if (index < 0) return
    const [connection] = this.connections.splice(index, 1)
    for (const other of this.connections) {
      other.socket.deliver({
        type: 'presence-leave',
        documentId: this.documentId,
        clientId: connection!.clientId,
      })
    }
  }

  /** Closes every connection from the server side. */
  disconnectAll(code = 1006): void {
    for (const connection of [...this.connections]) {
      this.drop(connection.socket)
      connection.socket.serverClose(code)
    }
  }

  /** Renames the document: connections get `document-renamed` and close with 4009. */
  rename(newId: string): void {
    const oldId = this.documentId
    this.oldIds.add(oldId)
    this.documentId = newId
    for (const connection of [...this.connections]) {
      connection.socket.deliver({
        type: 'document-renamed',
        documentId: oldId,
        newDocumentId: newId,
      })
      this.drop(connection.socket)
      setTimeout(() => connection.socket.serverClose(4009), 0)
    }
  }

  /** An edit by the server itself (like an external change on disk). */
  externalEdit(fn: (text: string) => string): void {
    const next = fn(this.doc.content)
    this.doc = this.A.change(this.doc, (d) => {
      this.A.updateText(d, ['content'], next)
    })
    this.syncAll()
  }

  /** Simulates a server that lost its saved state: a new lineage from the given file text. */
  restartWithNewEpoch(fileText = this.doc.content): void {
    this.disconnectAll(1001)
    this.doc = this.fresh(fileText)
    this.epoch = `epoch-${Math.random().toString(16).slice(2)}`
  }
}
