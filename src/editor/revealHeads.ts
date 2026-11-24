import type { Peer } from '@/sync/session'

/** Where the cursor of each agent is shown while the editor types its changes out (by actor). */
export interface RevealPlaces {
  /** The heads of the reveals: where text is revealed now. */
  heads: ReadonlyMap<string, number>
  /** Where the text revealed last ends, also once nothing is hidden. */
  ends: ReadonlyMap<string, number>
}

export const NO_REVEAL_PLACES: RevealPlaces = { heads: new Map(), ends: new Map() }

/**
 * The peers with the cursor of each agent at the head of its reveal (by actor), while the editor
 * types its change out: a follower follows that head, not the end of the text that is still
 * hidden. Back to the agent's focus when the reveal ends. An agent without a focus has no cursor
 * of its own: it stays at the end of the text revealed last between its chunks (R2 of
 * KodeEditor's docs/reveal.md), until it leaves.
 */
export function withRevealHeads(
  peers: readonly Peer[],
  places: RevealPlaces = NO_REVEAL_PLACES,
): readonly Peer[] {
  const { heads, ends } = places
  if (heads.size === 0 && ends.size === 0) return peers
  return peers.map((peer) => {
    if (!peer.agent || peer.actorId === undefined) return peer
    const head =
      heads.get(peer.actorId) ?? (peer.selections.length === 0 ? ends.get(peer.actorId) : undefined)
    if (head === undefined) return peer
    // the cursor, not the viewport: that is where the text is typed
    return { ...peer, selections: [{ anchor: head, head }], viewport: undefined }
  })
}
