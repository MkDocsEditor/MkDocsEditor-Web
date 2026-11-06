import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SocketLike } from '@/sync/socket'

import { connectEvents } from './events'
import type { OnlineUser } from './events'

class FakeSocket implements SocketLike {
  readyState = 0
  sent: Record<string, unknown>[] = []
  closedWith: number | null = null
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number; reason?: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(readonly url: string) {}

  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>)
  }
  close(code = 1000): void {
    if (this.readyState === 3) return
    this.closedWith = code
    this.readyState = 3
    this.onclose?.({ code })
  }
}

describe('connectEvents', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup(wsTicket = vi.fn(async (): Promise<{ ticket: string }> => ({ ticket: 't-1' }))) {
    const sockets: FakeSocket[] = []
    const onTreeChanged = vi.fn()
    let online = new Map<string, OnlineUser[]>()
    const onUnauthorized = vi.fn()
    const onItemsMoved = vi.fn()
    const onConnectionChanged = vi.fn()
    const connection = connectEvents({
      onItemsMoved,
      onConnectionChanged,
      wsTicket,
      wsUrl: (path) => `ws://b${path}`,
      createSocket: (url) => {
        const socket = new FakeSocket(url)
        sockets.push(socket)
        return socket
      },
      clientName: 'test',
      onTreeChanged,
      onOnline: (map) => (online = map),
      onUnauthorized,
    })
    return {
      sockets,
      onTreeChanged,
      online: () => online,
      onUnauthorized,
      onItemsMoved,
      onConnectionChanged,
      connection,
      wsTicket,
    }
  }

  it('reports a lost connection only after it worked, and when it works again', async () => {
    const { sockets, onConnectionChanged } = setup()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0]!.open()
    sockets[0]!.close()
    expect(onConnectionChanged).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    sockets[1]!.open()
    sockets[1]!.receive({ type: 'online', documents: [] })
    sockets[1]!.receive({ type: 'online', documents: [] })
    expect(onConnectionChanged.mock.calls).toEqual([[true]])

    sockets[1]!.close()
    expect(onConnectionChanged.mock.calls).toEqual([[true], [false]])
  })

  it('passes moved items on', async () => {
    const { sockets, onItemsMoved } = setup()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0]!.open()
    const move = { type: 'document', oldId: 'a', newId: 'b', oldPath: 'a.md', newPath: 'x/a.md' }
    sockets[0]!.receive({ type: 'items-moved', moves: [move, { broken: true }] })
    sockets[0]!.receive({ type: 'items-moved', moves: 'nonsense' })
    expect(onItemsMoved).toHaveBeenCalledTimes(1)
    expect(onItemsMoved).toHaveBeenCalledWith([move])
  })

  it('says hello with a ticket and reloads the tree on connect and on changes', async () => {
    const { sockets, onTreeChanged, online, connection } = setup()
    await vi.advanceTimersByTimeAsync(0)
    const socket = sockets[0]!
    expect(socket.url).toBe('ws://b/events/ws/')
    socket.open()
    expect(socket.sent[0]).toEqual({ type: 'hello', ticket: 't-1', client: 'test' })
    expect(onTreeChanged).toHaveBeenCalledTimes(1)

    socket.receive({
      type: 'online',
      documents: [
        { documentId: 'd-1', users: [{ username: 'anna', displayName: 'Anna', color: '#123' }] },
        { documentId: 'd-2', users: [{ username: 'ben', displayName: '' }] },
      ],
    })
    expect(connection.connected).toBe(true)
    expect(online().get('d-1')).toEqual([{ username: 'anna', displayName: 'Anna', color: '#123' }])
    expect(online().get('d-2')?.[0]?.displayName).toBe('ben')

    socket.receive({
      type: 'online',
      documents: [
        {
          documentId: 'd-1',
          users: [{ username: 'anna', displayName: 'Anna', accountId: 'a-1', avatar: 'ff00' }],
        },
      ],
    })
    expect(online().get('d-1')?.[0]).toMatchObject({ accountId: 'a-1', avatar: 'ff00' })

    socket.receive({ type: 'tree-changed' })
    expect(onTreeChanged).toHaveBeenCalledTimes(2)
    connection.close()
    expect(socket.closedWith).toBe(1000)
  })

  it('sends heartbeats and reconnects after silence, then reloads the tree again', async () => {
    const { sockets, onTreeChanged, online, connection } = setup()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0]!.open()
    sockets[0]!.receive({ type: 'online', documents: [{ documentId: 'd', users: [] }] })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sockets[0]!.sent.some((m) => m.type === 'heartbeat')).toBe(true)
    // the server goes silent
    await vi.advanceTimersByTimeAsync(15_000)
    expect(sockets[0]!.closedWith).toBe(4008)
    expect(online().size).toBe(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sockets).toHaveLength(2)
    sockets[1]!.open()
    expect(onTreeChanged).toHaveBeenCalledTimes(2)
    connection.close()
  })

  it('backs off while the server is unreachable', async () => {
    const { sockets, connection } = setup()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0]!.close(1006)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sockets).toHaveLength(2)
    sockets[1]!.close(1006)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sockets).toHaveLength(3)
    connection.close()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(3)
  })

  it('gives up when the credentials are refused', async () => {
    const wsTicket = vi.fn(async () =>
      Promise.reject(Object.assign(new Error('401'), { isUnauthorized: true })),
    )
    const { sockets, onUnauthorized } = setup(wsTicket)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(0)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(wsTicket).toHaveBeenCalledTimes(1)
  })

  describe('staying connected', () => {
    const open = async (fixture: ReturnType<typeof setup>) => {
      await vi.advanceTimersByTimeAsync(0)
      fixture.sockets.at(-1)!.open()
      fixture.sockets.at(-1)!.receive({ type: 'online', documents: [] })
    }

    it('answers server messages with heartbeats while its timers do not run', async () => {
      // like a background tab: timers are throttled, websocket messages still arrive
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as never)
      const fixture = setup()
      await open(fixture)
      setIntervalSpy.mockRestore()
      const socket = fixture.sockets[0]!
      const heartbeats = () => socket.sent.filter((m) => m.type === 'heartbeat')
      await vi.advanceTimersByTimeAsync(5_000)
      expect(heartbeats()).toHaveLength(0)
      socket.receive({ type: 'heartbeat' })
      expect(heartbeats()).toHaveLength(1)
      socket.receive({ type: 'heartbeat' })
      expect(heartbeats()).toHaveLength(1)
      fixture.connection.close()
    })

    it('reconnects after silence without waiting for the browser to close the socket', async () => {
      const fixture = setup()
      await open(fixture)
      const dead = fixture.sockets[0]!
      dead.close = () => undefined // the close handshake never finishes
      await vi.advanceTimersByTimeAsync(16_000 + 1_000)
      expect(fixture.sockets).toHaveLength(2)
      expect(fixture.online().size).toBe(0)
      fixture.connection.close()
    })

    it('gives up on a ticket request that hangs', async () => {
      const wsTicket = vi
        .fn(async () => ({ ticket: 't' }))
        .mockImplementationOnce(() => new Promise<never>(() => undefined))
      const fixture = setup(wsTicket)
      await vi.advanceTimersByTimeAsync(9_000)
      expect(wsTicket).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(3_100)
      expect(wsTicket).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.sockets).toHaveLength(1)
      fixture.connection.close()
    })

    it('gives up on a socket that never opens and ignores it afterwards', async () => {
      const fixture = setup()
      await vi.advanceTimersByTimeAsync(0)
      const stuck = fixture.sockets[0]!
      await vi.advanceTimersByTimeAsync(12_100)
      expect(fixture.sockets).toHaveLength(2)
      expect(stuck.closedWith).not.toBeNull()
      fixture.sockets[1]!.open()
      const before = fixture.onTreeChanged.mock.calls.length
      stuck.open()
      stuck.receive({ type: 'tree-changed' })
      expect(fixture.onTreeChanged).toHaveBeenCalledTimes(before)
      expect(stuck.sent).toEqual([])
      fixture.connection.close()
    })

    it('limits attempts started by the page coming back', async () => {
      const fixture = setup()
      await open(fixture)
      fixture.sockets[0]!.close(1006)
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.sockets).toHaveLength(1)
      // the first attempt was a moment ago, and new attempts are limited to one per 2 s
      await vi.advanceTimersByTimeAsync(100)
      globalThis.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.sockets).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(fixture.sockets).toHaveLength(2)
      fixture.connection.close()
    })

    it('a long backoff ends when the page comes back', async () => {
      const fixture = setup(vi.fn(async () => Promise.reject(new Error('down'))))
      await vi.advanceTimersByTimeAsync(20_000)
      const wsTicket = fixture.wsTicket
      wsTicket.mockImplementation(async () => ({ ticket: 't-2' }))
      const calls = wsTicket.mock.calls.length
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
      expect(wsTicket.mock.calls.length).toBe(calls + 1)
      fixture.connection.close()
    })

    it('a page coming back drops a socket that has been silent too long', async () => {
      const fixture = setup()
      await open(fixture)
      await vi.advanceTimersByTimeAsync(8_500)
      expect(fixture.sockets).toHaveLength(1)
      globalThis.dispatchEvent(new Event('focus'))
      expect(fixture.sockets[0]!.closedWith).not.toBeNull()
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.sockets).toHaveLength(2)
      fixture.connection.close()
    })

    it('stops watching the page when closed', async () => {
      const fixture = setup()
      await open(fixture)
      fixture.connection.close()
      await vi.advanceTimersByTimeAsync(3_000)
      globalThis.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.sockets).toHaveLength(1)
    })
  })

  it('reports the number of waiting access requests', async () => {
    const sockets: FakeSocket[] = []
    const onAccessRequests = vi.fn()
    const connection = connectEvents({
      wsTicket: async () => ({ ticket: 't' }),
      wsUrl: (path) => `ws://b${path}`,
      createSocket: (url) => {
        const socket = new FakeSocket(url)
        sockets.push(socket)
        return socket
      },
      clientName: 'test',
      onTreeChanged: vi.fn(),
      onOnline: vi.fn(),
      onAccessRequests,
    })
    await vi.advanceTimersByTimeAsync(0)
    sockets[0]!.open()
    sockets[0]!.receive({ type: 'access-requests', pending: 2 })
    sockets[0]!.receive({ type: 'access-requests' })
    expect(onAccessRequests.mock.calls).toEqual([[2]])
    connection.close()
  })
})
