import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SocketLike } from '@/sync/automergeSession'

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

  function setup(wsTicket = vi.fn(async () => ({ ticket: 't-1' }))) {
    const sockets: FakeSocket[] = []
    const onTreeChanged = vi.fn()
    let online = new Map<string, OnlineUser[]>()
    const onUnauthorized = vi.fn()
    const connection = connectEvents({
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
    return { sockets, onTreeChanged, online: () => online, onUnauthorized, connection }
  }

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
})
