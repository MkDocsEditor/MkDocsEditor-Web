import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { FakeSyncServer } from '@/test/fakeSyncServer'

import { loadAutomerge } from './automerge'
import type { Automerge } from './automerge'
import { createAutomergeSession, rebaseChanges } from './automergeSession'
import { memoryStore } from './offlineStore'
import type { OfflineStore } from './offlineStore'
import type { DocumentSession, TextChange } from './session'
import { applyChanges } from './session'

let A: typeof Automerge
beforeAll(async () => {
  A = await loadAutomerge()
})

const timing = {
  flushMs: 1,
  presenceMs: 1,
  persistMs: 1,
  heartbeatMs: 50,
  timeoutMs: 400,
  authorshipRefetchMs: 10_000,
  backoffMs: [5, 10, 20],
}

const sessions: DocumentSession[] = []
afterEach(() => {
  for (const s of sessions.splice(0)) s.close()
})

/** A client: a session plus a mirror of the editor text built only from emitted changes. */
function client(server: FakeSyncServer, username: string, store: OfflineStore = memoryStore()) {
  const session = createAutomergeSession({
    documentId: server.documentId,
    automerge: A,
    api: server.api(username),
    store,
    createSocket: server.socketFactory,
    timing,
  })
  sessions.push(session)
  let mirror = ''
  session.onRemoteChanges((changes) => {
    mirror = applyChanges(mirror, changes)
  })
  return {
    session,
    store,
    get mirror() {
      return mirror
    },
    /** Types like the editor: the change goes to the session and the mirror. */
    edit(changes: TextChange[]) {
      mirror = applyChanges(mirror, changes)
      session.applyLocalChanges(changes)
    },
    insert(at: number | 'end', text: string) {
      const index = at === 'end' ? mirror.length : at
      this.edit([{ from: index, to: index, insert: text }])
    },
  }
}

const online = (c: ReturnType<typeof client>) =>
  vi.waitFor(() => expect(c.session.status.value.connection).toBe('online'))

describe('Automerge session', () => {
  it('loads the server document and reports the user', async () => {
    const server = new FakeSyncServer(A, '# Hallo\n')
    const anna = client(server, 'anna')
    await anna.session.ready
    await online(anna)
    expect(anna.session.getText()).toBe('# Hallo\n')
    expect(anna.mirror).toBe('# Hallo\n')
    expect(anna.session.me.value?.username).toBe('anna')
    expect(anna.session.status.value.readOnly).toBe(false)
    const hello = server.connections[0]!.socket.sent[0]!
    expect(hello).toMatchObject({ type: 'hello', ticket: 'ticket-anna', documentId: 'doc-1' })
    expect(hello.actorId).toMatch(/^[0-9a-f]{32}$/)
    expect(hello.epoch).toBeUndefined()
  })

  it('two clients editing concurrently converge, with non-ASCII text', async () => {
    const server = new FakeSyncServer(A, 'Mitte\n')
    const anna = client(server, 'anna')
    const ben = client(server, 'ben')
    await Promise.all([online(anna), online(ben)])
    anna.insert(0, 'Anna 😀 ')
    ben.insert('end', 'Ben äöü 🎉\n')
    await vi.waitFor(() => {
      expect(anna.session.getText()).toBe(ben.session.getText())
      expect(anna.session.getText()).toContain('Anna 😀')
      expect(anna.session.getText()).toContain('Ben äöü 🎉')
    })
    expect(server.text).toBe(anna.session.getText())
    // the editor mirrors built from change events match the documents
    expect(anna.mirror).toBe(anna.session.getText())
    expect(ben.mirror).toBe(ben.session.getText())
    await vi.waitFor(() => expect(anna.session.status.value.unsynced).toBe(false))
  })

  it('emits precise changes for edits in different places', async () => {
    const server = new FakeSyncServer(A, 'eins zwei drei')
    const anna = client(server, 'anna')
    const ben = client(server, 'ben')
    await Promise.all([online(anna), online(ben)])
    const seen: TextChange[][] = []
    anna.session.onRemoteChanges((c) => seen.push([...c]))
    ben.edit([
      { from: 0, to: 4, insert: 'EINS' },
      { from: 10, to: 14, insert: 'DREI' },
    ])
    await vi.waitFor(() => expect(anna.session.getText()).toBe('EINS zwei DREI'))
    // never a single replacement of the whole text
    for (const changes of seen) for (const c of changes) expect(c.to - c.from).toBeLessThan(10)
  })

  it('keeps offline edits and merges them after the reconnect', async () => {
    const server = new FakeSyncServer(A, 'Text\n')
    const anna = client(server, 'anna')
    const ben = client(server, 'ben')
    await Promise.all([online(anna), online(ben)])

    server.offline = true
    server.disconnectAll()
    await vi.waitFor(() => expect(anna.session.status.value.connection).toBe('offline'))
    anna.insert(0, 'offline von Anna. ')
    expect(anna.session.status.value.unsynced).toBe(true)

    server.offline = false
    // meanwhile on the server: ben edits after his reconnect, and the file changes on disk
    await online(ben)
    ben.insert('end', 'Ben war hier.\n')
    server.externalEdit((t) => t + 'Von der Platte.\n')

    await vi.waitFor(() => {
      for (const t of [anna.session.getText(), ben.session.getText(), server.text]) {
        expect(t).toContain('offline von Anna.')
        expect(t).toContain('Ben war hier.')
        expect(t).toContain('Von der Platte.')
      }
      expect(anna.session.getText()).toBe(server.text)
    })
    expect(anna.mirror).toBe(anna.session.getText())
    // the reconnect sent the known epoch
    const hellos = server.connections
      .find((c) => c.user.username === 'anna')!
      .socket.sent.filter((m) => m.type === 'hello')
    expect(hellos[0]?.epoch).toBe('epoch-1')
  })

  it('survives a reload with unsynced edits (persisted copy)', async () => {
    const server = new FakeSyncServer(A, 'Hallo\n')
    const store = memoryStore()
    const first = client(server, 'anna', store)
    await online(first)
    server.offline = true
    server.disconnectAll()
    await vi.waitFor(() => expect(first.session.status.value.connection).toBe('offline'))
    first.insert('end', 'nicht verloren\n')
    await vi.waitFor(async () => expect((await store.get('doc-1'))?.bytes).toBeDefined())
    first.session.close()
    await new Promise((r) => setTimeout(r, 20))

    // "reload": a new session with the same store, still offline
    const second = client(server, 'anna', store)
    await second.session.ready
    expect(second.session.getText()).toBe('Hallo\nnicht verloren\n')
    expect(second.session.status.value.unsynced).toBe(true)
    server.offline = false
    await vi.waitFor(() => expect(server.text).toBe('Hallo\nnicht verloren\n'))
    await vi.waitFor(() => expect(second.session.status.value.unsynced).toBe(false))
  })

  it('re-applies unsynced edits when the server starts a new epoch', async () => {
    const server = new FakeSyncServer(A, 'Zeile 1\nZeile 2\n')
    const anna = client(server, 'anna')
    await online(anna)
    server.offline = true
    server.restartWithNewEpoch('Zeile 1\nZeile 2\nvon Git\n')
    await vi.waitFor(() => expect(anna.session.status.value.connection).toBe('offline'))
    anna.insert(0, 'Neu: ')
    server.offline = false
    await vi.waitFor(() => {
      expect(server.text).toBe('Neu: Zeile 1\nZeile 2\nvon Git\n')
      expect(anna.session.getText()).toBe(server.text)
    })
    expect(anna.mirror).toBe(anna.session.getText())
  })

  it('shares cursors as Automerge cursors that follow concurrent edits', async () => {
    const server = new FakeSyncServer(A, 'Hallo Welt')
    const anna = client(server, 'anna')
    const ben = client(server, 'ben')
    await Promise.all([online(anna), online(ben)])
    anna.session.setLocalSelections([{ anchor: 6, head: 10 }])
    await vi.waitFor(() =>
      expect(ben.session.peers.value).toEqual([
        expect.objectContaining({
          username: 'anna',
          displayName: 'Anna',
          color: '#1971c2',
          selections: [{ anchor: 6, head: 10 }],
        }),
      ]),
    )
    ben.insert(0, '>> ')
    await vi.waitFor(() =>
      expect(ben.session.peers.value[0]?.selections).toEqual([{ anchor: 9, head: 13 }]),
    )
    // a caret after the last character travels as the reserved cursor "end"
    anna.session.setLocalSelections([{ anchor: 10, head: 10 }])
    await vi.waitFor(() => {
      const sent = server.connections.find((c) => c.user.username === 'anna')!.socket.sent
      expect(sent.filter((m) => m.type === 'presence').at(-1)).toMatchObject({
        selections: [{ anchor: 'end', head: 'end' }],
      })
    })
    await vi.waitFor(() =>
      expect(ben.session.peers.value[0]?.selections).toEqual([{ anchor: 13, head: 13 }]),
    )
    anna.session.close()
    await vi.waitFor(() => expect(ben.session.peers.value).toEqual([]))
  })

  it('is read-only for readers and never sends their text to others', async () => {
    const server = new FakeSyncServer(A, 'Nur lesen')
    server.readOnlyUsers.add('carla')
    const carla = client(server, 'carla')
    const anna = client(server, 'anna')
    await Promise.all([online(carla), online(anna)])
    expect(carla.session.status.value.readOnly).toBe(true)
    carla.session.applyLocalChanges([{ from: 0, to: 0, insert: 'X' }])
    expect(carla.session.getText()).toBe('Nur lesen')
    anna.insert(0, 'Anna: ')
    await vi.waitFor(() => expect(carla.session.getText()).toBe('Anna: Nur lesen'))
  })

  it('closes for good when the document is deleted, keeping the text', async () => {
    const server = new FakeSyncServer(A, 'weg')
    const anna = client(server, 'anna')
    await online(anna)
    const ticketsBefore = server.ticketsIssued
    server.disconnectAll(4004)
    await vi.waitFor(() => expect(anna.session.status.value.connection).toBe('closed'))
    expect(anna.session.status.value.message).toContain('gelöscht')
    expect(anna.session.getText()).toBe('weg')
    await new Promise((r) => setTimeout(r, 50))
    expect(server.ticketsIssued).toBe(ticketsBefore)
  })

  it('reconnects when the server stays silent (heartbeat timeout)', async () => {
    const server = new FakeSyncServer(A, 'still')
    const anna = client(server, 'anna')
    await online(anna)
    // the server stops answering without closing the socket
    const socket = server.connections[0]!.socket
    socket.deliver = () => undefined
    await vi.waitFor(() => expect(server.ticketsIssued).toBeGreaterThan(1), { timeout: 3000 })
    await online(anna)
  })
})

describe('rebaseChanges', () => {
  it('places changes by their context when the target text moved', () => {
    const base = 'eins\nzwei\n'
    const unsynced = [{ from: 5, to: 9, insert: 'ZWEI' }]
    const target = 'null\neins\nzwei\n'
    expect(applyChanges(target, rebaseChanges(base, unsynced, target))).toBe('null\neins\nZWEI\n')
  })

  it('never drops inserted text', () => {
    const changes = rebaseChanges('abc', [{ from: 1, to: 1, insert: 'X' }], 'völlig anders')
    expect(applyChanges('völlig anders', changes)).toContain('X')
  })
})
