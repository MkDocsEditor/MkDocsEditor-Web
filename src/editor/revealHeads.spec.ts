import { describe, expect, it } from 'vitest'

import type { Peer } from '@/sync/session'

import { withRevealHeads } from './revealHeads'

const person: Peer = {
  clientId: 'c1',
  instanceId: 'i1',
  actorId: 'aa',
  username: 'anna',
  displayName: 'Anna',
  color: '#000',
  selections: [{ anchor: 1, head: 1 }],
}
const agent: Peer = {
  ...person,
  clientId: 'agent-1',
  instanceId: 'agent-1',
  actorId: 'bb',
  agent: { tokenId: 't', name: 'claude' },
  selections: [{ anchor: 0, head: 40 }],
  viewport: { top: 0, bottom: 80 },
}

describe('withRevealHeads', () => {
  it('puts the cursor of an agent at the head of its reveal, without a viewport', () => {
    const [p, a] = withRevealHeads([person, agent], {
      heads: new Map([['bb', 12]]),
      ends: new Map(),
    })
    expect(p).toBe(person)
    expect(a).toMatchObject({ selections: [{ anchor: 12, head: 12 }], viewport: undefined })
  })

  it('never moves a person, also with the same actor', () => {
    expect(
      withRevealHeads([person], { heads: new Map([['aa', 3]]), ends: new Map([['aa', 3]]) }),
    ).toEqual([person])
  })

  it('keeps the cursor of an agent without a focus at the end of its last reveal', () => {
    const quiet = { ...agent, selections: [], viewport: undefined }
    const places = { heads: new Map(), ends: new Map([['bb', 20]]) }
    expect(withRevealHeads([quiet], places)[0]).toMatchObject({
      selections: [{ anchor: 20, head: 20 }],
    })
    // its focus wins once it has one, and the head while text is hidden
    expect(withRevealHeads([agent], places)[0]).toBe(agent)
    expect(
      withRevealHeads([quiet], { heads: new Map([['bb', 25]]), ends: places.ends })[0],
    ).toMatchObject({ selections: [{ anchor: 25, head: 25 }] })
  })
})
