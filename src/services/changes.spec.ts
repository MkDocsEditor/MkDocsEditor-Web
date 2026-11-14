import { describe, expect, it } from 'vitest'

import { describeChangers } from './changes'

const person = (displayName: string, agents: string[] = []) => ({
  displayName,
  color: '#000',
  avatar: null,
  agents,
})

describe('describeChangers', () => {
  it('names people and the agents they used', () => {
    expect(describeChangers([person('alice')])).toBe('alice')
    expect(describeChangers([person('alice'), person('bob', ['Claude Code'])])).toBe(
      'alice and bob via Claude Code',
    )
    expect(describeChangers([person('a'), person('b'), person('c')])).toBe('a, b and c')
    expect(describeChangers([])).toBe('someone')
  })
})
