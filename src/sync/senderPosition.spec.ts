import { describe, expect, it } from 'vitest'

import { senderPosition } from './senderPosition'
import type { Peer, TextSelection } from './session'

function peer(
  clientId: string,
  accountId: string,
  lastActiveAt: string | undefined,
  selections: TextSelection[],
): Peer {
  return {
    clientId,
    accountId,
    lastActiveAt,
    selections,
    username: 'u',
    displayName: 'U',
    color: '#000',
  }
}

const at = (head: number): TextSelection[] => [{ anchor: 0, head }]

describe('senderPosition', () => {
  it('takes the newest connection of the sender that has a selection', () => {
    const peers = [
      peer('a', 'sender', '2026-11-05T09:00:00Z', at(1)),
      peer('b', 'sender', '2026-11-05T09:30:00Z', at(2)),
      peer('c', 'sender', '2026-11-05T09:45:00Z', []),
      peer('d', 'other', '2026-11-05T10:00:00Z', at(3)),
    ]
    expect(senderPosition(peers, 'sender')).toBe(2)
  })

  it('uses the head of the first selection', () => {
    const selections = [
      { anchor: 5, head: 9 },
      { anchor: 20, head: 21 },
    ]
    expect(senderPosition([peer('a', 'sender', undefined, selections)], 'sender')).toBe(9)
  })

  it('is null without a selection or without the sender', () => {
    expect(senderPosition([peer('a', 'sender', undefined, [])], 'sender')).toBeNull()
    expect(senderPosition([peer('a', 'other', undefined, at(1))], 'sender')).toBeNull()
  })
})
