import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AmDoc, AutomergeApi } from './automerge'
import { createPresence } from './presence'
import type { PresenceInfo } from './protocol'

const anna: PresenceInfo = {
  clientId: 'c-1',
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
        accountId: 'anna',
        selections: [at(5)],
        viewport: { top: 'at-10', bottom: 'at-20' },
        ghostMs: 60_000,
      })
      expect(presence.peers.value).toEqual([])
      expect(presence.ghosts.value).toEqual([
        {
          accountId: 'anna',
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

    it('ends when the account is back, and its timer does nothing after that', () => {
      const { presence } = setup()
      presence.remove({ clientId: 'c-1', accountId: 'anna', selections: [], ghostMs: 1000 })
      presence.update({ ...anna, clientId: 'c-2', selections: [at(1)] })
      expect(presence.ghosts.value).toEqual([])
      expect(presence.peers.value).toHaveLength(1)
      vi.advanceTimersByTime(1000)
      expect(presence.peers.value).toHaveLength(1)
    })

    it('comes from a snapshot with the remaining time, unless the account is online', () => {
      const { presence } = setup()
      presence.replaceAll(
        [{ ...anna, accountId: 'online', clientId: 'c-9' }],
        [
          { accountId: 'anna', username: 'anna', selections: [at(3)], ghostMs: 500 },
          { accountId: 'online', username: 'o', selections: [at(4)], ghostMs: 500 },
          { accountId: 'away', username: 'a', selections: [at(5)] },
        ],
      )
      expect(presence.known.value).toBe(true)
      expect(presence.ghosts.value.map((g) => g.accountId)).toEqual(['anna'])
      vi.advanceTimersByTime(500)
      expect(presence.ghosts.value).toEqual([])
    })

    it('forgets everybody when the connection ends', () => {
      const { presence } = setup()
      presence.replaceAll([], [{ accountId: 'anna', username: 'anna', selections: [], ghostMs: 9 }])
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
