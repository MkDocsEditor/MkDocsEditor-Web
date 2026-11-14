import type { Ghost, Peer, TextRange } from './session'

/**
 * What to look at in order to see what an instance sees: of its connections the one active last,
 * there the viewport or else the cursor; then the same of its ghost. A cursor is a range of one
 * position. Null while there is nothing to look at.
 */
export function followTarget(
  peers: readonly Peer[],
  ghosts: readonly Ghost[],
  instanceId: string,
): TextRange | null {
  const connections = peers
    .filter((peer) => peer.instanceId === instanceId)
    .sort((a, b) => activeAt(b) - activeAt(a))
  for (const connection of connections) {
    const target = targetOf(connection)
    if (target) return target
  }
  const ghost = ghosts.find((g) => g.instanceId === instanceId)
  return ghost ? targetOf(ghost) : null
}

/** Whether the instance is here, which a ghost still counts as. */
export function isPresent(
  peers: readonly Peer[],
  ghosts: readonly Ghost[],
  instanceId: string,
): boolean {
  return (
    peers.some((p) => p.instanceId === instanceId) ||
    ghosts.some((g) => g.instanceId === instanceId)
  )
}

/**
 * The instance of an account to follow: active last and with a place to look at if possible. Not
 * an agent of the account: it has no cursor, and the link came from the person.
 */
export function latestInstanceOf(
  peers: readonly Peer[],
  ghosts: readonly Ghost[],
  accountId: string,
): string | null {
  const own = peers
    .filter((peer) => peer.accountId === accountId && !peer.agent)
    .sort((a, b) => activeAt(b) - activeAt(a))
  const latest = own.find((peer) => targetOf(peer)) ?? own[0]
  return (
    latest?.instanceId ??
    ghosts.find((g) => g.accountId === accountId && !g.agent)?.instanceId ??
    null
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
