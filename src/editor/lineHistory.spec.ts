import { describe, expect, it } from 'vitest'

import type { Blame } from '@/api'

import { blockOf, describeLine } from './lineHistory'

/** The backend's answer: initial commit, bob's line, bob's agent and alice not committed yet. */
const BLAME: Blame = {
  revision: 'e30a2e63',
  lines: 6,
  blocks: [
    {
      start: 1,
      end: 3,
      pending: false,
      revision: 'c2c4e4aa',
      time: '2026-11-14T04:06:51Z',
      message: 'Initial',
      author: { displayName: 'Test', color: '#1971c2', avatar: null },
      agents: [],
    },
    {
      start: 4,
      end: 4,
      pending: false,
      revision: 'bda6b3d2',
      time: '2026-11-14T04:06:51Z',
      message: 'Update guide/setup.md',
      author: {
        accountId: 'b',
        username: 'bob',
        displayName: 'bob',
        color: '#2f9e44',
        avatar: null,
      },
      agents: [],
    },
    {
      start: 5,
      end: 5,
      pending: true,
      revision: null,
      time: null,
      message: null,
      author: {
        accountId: 'b',
        username: 'bob',
        displayName: 'bob',
        color: '#2f9e44',
        avatar: null,
      },
      agents: ['claude'],
    },
    {
      start: 6,
      end: 6,
      pending: true,
      revision: null,
      time: null,
      message: null,
      author: null,
      agents: [],
    },
  ],
}

describe('line history', () => {
  const now = Date.parse('2026-11-14T06:06:51Z')

  it('says who wrote a line and when, with the message someone wrote', () => {
    expect(describeLine(blockOf(BLAME, 2), now)).toEqual(['Test · 2 hours ago', 'Initial'])
    // the backend's own message is left out
    expect(describeLine(blockOf(BLAME, 4), now)).toEqual(['bob · 2 hours ago'])
  })

  it('says when a line is not in the history yet', () => {
    expect(describeLine(blockOf(BLAME, 5), now)).toEqual(['bob via claude, not in the history yet'])
    expect(describeLine(blockOf(BLAME, 6), now)).toEqual(['Not in the history yet'])
    expect(describeLine(blockOf(BLAME, 7), now)).toEqual(['Not in the history yet'])
  })
})
