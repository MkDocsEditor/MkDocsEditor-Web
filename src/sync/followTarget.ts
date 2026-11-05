import type { Ghost, Peer, TextRange } from './session'

/**
 * What to look at in order to see what an account sees: of its connections the one active last,
 * there the viewport or else the cursor; then the same of its ghost. A cursor is a range of one
 * position. Null while there is nothing to look at.
 */
export function followTarget(
  peers: readonly Peer[],
  ghosts: readonly Ghost[],
  accountId: string,
): TextRange | null {
  const connections = peers
    .filter((peer) => peer.accountId === accountId)
    .sort((a, b) => activeAt(b) - activeAt(a))
  for (const connection of connections) {
    const target = targetOf(connection)
    if (target) return target
  }
  const ghost = ghosts.find((g) => g.accountId === accountId)
  return ghost ? targetOf(ghost) : null
}

/** Whether the account is here, which a ghost still counts as. */
export function isPresent(
  peers: readonly Peer[],
  ghosts: readonly Ghost[],
  accountId: string,
): boolean {
  return (
    peers.some((p) => p.accountId === accountId) || ghosts.some((g) => g.accountId === accountId)
  )
}

function targetOf(who: Pick<Peer, 'viewport' | 'selections'>): TextRange | null {
  if (who.viewport) return who.viewport
  const head = who.selections[0]?.head
  return head === undefined ? null : { top: head, bottom: head }
}

function activeAt(peer: Peer): number {
  const time = peer.lastActiveAt ? Date.parse(peer.lastActiveAt) : NaN
  return Number.isNaN(time) ? 0 : time
}
