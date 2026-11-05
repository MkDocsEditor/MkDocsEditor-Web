import type { Peer } from './session'

/**
 * Where the sender of a join link is: of the sender's connections that have a selection, the one
 * active last, and there the head of the primary selection. Null while there is none.
 */
export function senderPosition(peers: readonly Peer[], accountId: string): number | null {
  let newest: Peer | null = null
  for (const peer of peers) {
    if (peer.accountId !== accountId || peer.selections.length === 0) continue
    if (!newest || activeAt(peer) > activeAt(newest)) newest = peer
  }
  return newest?.selections[0]?.head ?? null
}

function activeAt(peer: Peer): number {
  const time = peer.lastActiveAt ? Date.parse(peer.lastActiveAt) : NaN
  return Number.isNaN(time) ? 0 : time
}
