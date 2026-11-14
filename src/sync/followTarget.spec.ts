import { describe, expect, it } from 'vitest'

import { followTarget, isPresent, latestInstanceOf } from './followTarget'
import type { Ghost, Peer, TextRange } from './session'

function peer(fields: Partial<Peer> & { head?: number; viewport?: TextRange }): Peer {
  const { head, ...rest } = fields
  return {
    clientId: 'c',
    instanceId: 'a',
    accountId: 'a',
    username: 'a',
    displayName: 'a',
    color: '#000',
    selections: head === undefined ? [] : [{ anchor: head, head }],
    ...rest,
  }
}

function ghost(fields: Partial<Ghost> = {}): Ghost {
  return {
    instanceId: 'a',
    accountId: 'a',
    username: 'a',
    displayName: 'a',
    color: '#000',
    selections: [],
    ...fields,
  }
}

describe('followTarget', () => {
  it('prefers the viewport over the cursor', () => {
    const peers = [peer({ head: 5, viewport: { top: 10, bottom: 20 } })]
    expect(followTarget(peers, [], 'a')).toEqual({ top: 10, bottom: 20 })
  })

  it('uses the cursor without a viewport', () => {
    expect(followTarget([peer({ head: 5 })], [], 'a')).toEqual({ top: 5, bottom: 5 })
  })

  it('takes the connection active last, and skips one with nothing to look at', () => {
    const old = peer({ head: 1, lastActiveAt: '2026-01-01T00:00:00Z' })
    const recent = peer({ head: 2, lastActiveAt: '2026-01-02T00:00:00Z' })
    const newestEmpty = peer({ lastActiveAt: '2026-01-03T00:00:00Z' })
    expect(followTarget([old, recent, newestEmpty], [], 'a')).toEqual({ top: 2, bottom: 2 })
  })

  it('falls back to the ghost, and ignores other instances', () => {
    const other = peer({ instanceId: 'b', head: 9 })
    const left = ghost({ viewport: { top: 3, bottom: 4 } })
    expect(followTarget([other], [left], 'a')).toEqual({ top: 3, bottom: 4 })
    expect(followTarget([other], [], 'a')).toBeNull()
    expect(followTarget([peer({})], [], 'a')).toBeNull()
  })
})

describe('isPresent', () => {
  it('counts a connection and a ghost', () => {
    expect(isPresent([peer({})], [], 'a')).toBe(true)
    expect(isPresent([], [ghost()], 'a')).toBe(true)
    expect(isPresent([peer({ instanceId: 'b' })], [], 'a')).toBe(false)
  })
})

describe('latestInstanceOf', () => {
  it('takes the instance active last that has a place to look at', () => {
    const old = peer({ instanceId: 'old', head: 1, lastActiveAt: '2026-01-01T00:00:00Z' })
    const empty = peer({ instanceId: 'empty', lastActiveAt: '2026-01-03T00:00:00Z' })
    expect(latestInstanceOf([old, empty], [], 'a')).toBe('old')
    expect(latestInstanceOf([empty], [], 'a')).toBe('empty')
  })

  it('takes a ghost when no instance is connected, and only of this account', () => {
    expect(latestInstanceOf([], [ghost({ instanceId: 'left' })], 'a')).toBe('left')
    expect(latestInstanceOf([peer({ accountId: 'b' })], [], 'a')).toBeNull()
  })

  it('never takes an agent of the account: it has no cursor, and the link came from the person', () => {
    const agent = { tokenId: 't1', name: 'Claude Code' }
    const now = '2026-11-14T10:00:00Z'
    expect(
      latestInstanceOf(
        [peer({ instanceId: 'bot', agent, lastActiveAt: now }), peer({ instanceId: 'tab' })],
        [],
        'a',
      ),
    ).toBe('tab')
    expect(latestInstanceOf([peer({ instanceId: 'bot', agent })], [], 'a')).toBeNull()
    expect(latestInstanceOf([], [ghost({ instanceId: 'bot', agent })], 'a')).toBeNull()
  })
})
