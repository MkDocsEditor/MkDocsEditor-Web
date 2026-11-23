import type { Peer } from '@/sync/session'

/**
 * The peers with the cursor of each agent at the head of its reveal (by actor), while the editor
 * types its change out: a follower follows that head, not the end of the text that is still
 * hidden. Back to the agent's focus when the reveal ends.
 */
export function withRevealHeads(
  peers: readonly Peer[],
  heads: ReadonlyMap<string, number>,
): readonly Peer[] {
  if (heads.size === 0) return peers
  return peers.map((peer) => {
    const head = peer.agent && peer.actorId !== undefined ? heads.get(peer.actorId) : undefined
    if (head === undefined) return peer
    // the cursor, not the viewport: that is where the text is typed
    return { ...peer, selections: [{ anchor: head, head }], viewport: undefined }
  })
}
