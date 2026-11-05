import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AmDoc, AutomergeApi } from './automerge'
import { createPresence } from './presence'
import type { PresenceInfo } from './protocol'

const anna: PresenceInfo = {
  clientId: 'c-1',
  instanceId: 'tab-1',
  accountId: 'anna',
  username: 'anna',
  displayName: 'Anna',
  color: '#123456',
}

/** A cursor is the index with a prefix; `bad` points into a change that has not arrived. */
const automerge = {
  getCursor: (_doc: AmDoc, _path: string[], index: number) => `at-${index}`,
  getCursorPosition: (_doc: AmDoc, _path: string[], cursor: string) => {
    if (cursor === 'bad') throw new Error('unknown cursor')
    return Number(cursor.replace('at-', ''))
  },
} as unknown as AutomergeApi

function setup(content = 'x'.repeat(100)) {
  const send = vi.fn()
  const presence = createPresence({
    automerge: () => automerge,
    doc: () => ({ content }) as unknown as AmDoc,
    documentId: () => 'doc',
    isSynced: () => true,
    send,
    presenceMs: 100,
  })
  return { presence, send }
}

const at = (index: number) => ({ anchor: `at-${index}`, head: `at-${index}` })

describe('presence', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  describe('ghosts', () => {
    it('keeps the cursor of the last connection that leaves, for the time of the server', () => {
      const { presence } = setup()
      presence.update(anna)
      presence.remove({
        clientId: 'c-1',
        instanceId: 'tab-1',
        accountId: 'anna',
        deviceName: 'Pixel 8',
        selections: [at(5)],
        viewport: { top: 'at-10', bottom: 'at-20' },
        ghostMs: 60_000,
      })
      expect(presence.peers.value).toEqual([])
      expect(presence.ghosts.value).toEqual([
        {
          instanceId: 'tab-1',
          accountId: 'anna',
          deviceName: 'Pixel 8',
          username: 'anna',
          displayName: 'Anna',
          color: '#123456',
          selections: [{ anchor: 5, head: 5 }],
          viewport: { top: 10, bottom: 20 },
        },
      ])
      vi.advanceTimersByTime(59_999)
      expect(presence.ghosts.value).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(presence.ghosts.value).toEqual([])
    })

    it('has no ghost without ghostMs', () => {
      const { presence } = setup()
      presence.update(anna)
      presence.remove({ clientId: 'c-1' })
      expect(presence.ghosts.value).toEqual([])
    })

    it('keeps the ghost of one instance while another of the account is here', () => {
      const { presence } = setup()
      presence.update({ ...anna, clientId: 'c-2', instanceId: 'tab-2' })
      presence.remove({
        clientId: 'c-1',
        instanceId: 'tab-1',
        accountId: 'anna',
        selections: [at(1)],
        ghostMs: 1000,
      })
      presence.update({ ...anna, clientId: 'c-2', instanceId: 'tab-2', selections: [at(2)] })
      expect(presence.ghosts.value.map((g) => g.instanceId)).toEqual(['tab-1'])
    })

    it('counts an account as one instance on a server without instances', () => {
      const { presence } = setup()
      presence.remove({ clientId: 'c-1', accountId: 'anna', selections: [], ghostMs: 1000 })
      expect(presence.ghosts.value.map((g) => g.instanceId)).toEqual(['anna'])
      presence.update({ ...anna, instanceId: undefined, clientId: 'c-2' })
      expect(presence.ghosts.value).toEqual([])
      expect(presence.peers.value[0]!.instanceId).toBe('anna')
    })

    it('ends when the instance is back, and its timer does nothing after that', () => {
      const { presence } = setup()
      presence.remove({
        clientId: 'c-1',
        instanceId: 'tab-1',
        accountId: 'anna',
        selections: [],
        ghostMs: 1000,
      })
      presence.update({ ...anna, clientId: 'c-2', selections: [at(1)] })
      expect(presence.ghosts.value).toEqual([])
      expect(presence.peers.value).toHaveLength(1)
      vi.advanceTimersByTime(1000)
      expect(presence.peers.value).toHaveLength(1)
    })

    it('comes from a snapshot with the remaining time, unless the instance is online', () => {
      const { presence } = setup()
      const left = (instanceId: string) => ({
        instanceId,
        accountId: 'anna',
        username: 'anna',
        instanceColor: '#00ff00',
        selections: [at(3)],
        ghostMs: 500,
      })
      presence.replaceAll(
        [{ ...anna, instanceId: 'online', clientId: 'c-9' }],
        [{ accountId: 'away', username: 'a', selections: [at(5)] }],
        [left('tab-1'), left('online')],
      )
      expect(presence.known.value).toBe(true)
      expect(presence.ghosts.value.map((g) => g.instanceId)).toEqual(['tab-1'])
      expect(presence.ghosts.value[0]!.color).toBe('#00ff00')
      vi.advanceTimersByTime(500)
      expect(presence.ghosts.value).toEqual([])
    })

    it('forgets everybody when the connection ends', () => {
      const { presence } = setup()
      presence.replaceAll(
        [],
        [],
        [{ instanceId: 'tab-1', accountId: 'anna', username: 'anna', selections: [], ghostMs: 9 }],
      )
      presence.clear()
      expect(presence.known.value).toBe(false)
      expect(presence.ghosts.value).toEqual([])
    })
  })

  describe('viewport of others', () => {
    it('resolves it, and has none when the server sends none', () => {
      const { presence } = setup()
      presence.update({ ...anna, viewport: { top: 'at-1', bottom: 'end' } })
      expect(presence.peers.value[0]!.viewport).toEqual({ top: 1, bottom: 100 })
      presence.update(anna)
      expect(presence.peers.value[0]!.viewport).toBeUndefined()
    })

    it('stays where it was while a cursor points into an unknown change', () => {
      const { presence } = setup()
      presence.update({ ...anna, viewport: { top: 'at-1', bottom: 'at-2' } })
      presence.update({ ...anna, viewport: { top: 'bad', bottom: 'at-2' } })
      expect(presence.peers.value[0]!.viewport).toEqual({ top: 1, bottom: 2 })
    })

    it('falls back to the viewport for the last position', () => {
      const { presence } = setup()
      presence.replaceAll(
        [],
        [{ accountId: 'anna', selections: [], viewport: { top: 'at-7', bottom: 'at-9' } }],
      )
      expect(presence.lastPositionOf('anna')).toBe(7)
    })
  })

  describe('instance color', () => {
    it('shows instead of the color of the account', () => {
      const { presence } = setup()
      presence.update({ ...anna, instanceColor: '#00ff00' })
      expect(presence.peers.value[0]!.color).toBe('#00ff00')
      presence.update(anna)
      expect(presence.peers.value[0]!.color).toBe('#123456')
    })

    it('goes out once, and null clears it', () => {
      const { presence, send } = setup()
      presence.setLocalColor('#00ff00')
      vi.advanceTimersByTime(100)
      expect(send.mock.lastCall![0]).toMatchObject({ instanceColor: '#00ff00' })
      presence.setLocalSelections([])
      vi.advanceTimersByTime(100)
      expect(send.mock.lastCall![0]).not.toHaveProperty('instanceColor')
      presence.setLocalColor(null)
      vi.advanceTimersByTime(100)
      expect(send.mock.lastCall![0]).toMatchObject({ instanceColor: null })
    })
  })

  describe('own viewport', () => {
    const viewports = (send: ReturnType<typeof vi.fn>) =>
      send.mock.calls.map(([message]) => message.viewport)

    it('is not in a message until the editor has told us', () => {
      const { presence, send } = setup()
      presence.setLocalSelections([{ anchor: 1, head: 1 }])
      vi.advanceTimersByTime(100)
      expect(send.mock.calls[0]![0]).not.toHaveProperty('viewport')
    })

    it('goes out about twice per second, and once more when scrolling stops', () => {
      const { presence, send } = setup()
      presence.setLocalViewport({ top: 0, bottom: 10 })
      vi.advanceTimersByTime(400)
      presence.setLocalViewport({ top: 5, bottom: 15 })
      vi.advanceTimersByTime(50)
      presence.setLocalViewport({ top: 8, bottom: 18 })
      expect(send).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(600)
      expect(viewports(send)).toEqual([
        { top: 'at-0', bottom: 'at-10' },
        { top: 'at-8', bottom: 'at-18' },
      ])
    })

    it('clears at once with null', () => {
      const { presence, send } = setup()
      presence.setLocalViewport({ top: 0, bottom: 10 })
      presence.setLocalViewport(null)
      vi.advanceTimersByTime(100)
      expect(viewports(send)).toEqual([null])
      vi.advanceTimersByTime(1000)
      expect(send).toHaveBeenCalledTimes(1)
    })

    it('is sent to a new connection, also without a cursor', () => {
      const { presence, send } = setup()
      presence.setLocalViewport({ top: 0, bottom: 10 })
      vi.advanceTimersByTime(600)
      send.mockClear()
      presence.sendCurrent()
      expect(send.mock.calls[0]![0]).toMatchObject({
        selections: [],
        viewport: { top: 'at-0', bottom: 'at-10' },
      })
    })
  })
})
