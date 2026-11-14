import { describe, expect, it } from 'vitest'

import { expiryTime, localDay, tokenNameRule } from './appTokens'

const NOW = new Date(2026, 10, 14, 10, 0, 0).getTime()

describe('appTokens', () => {
  it('checks names like the backend', () => {
    expect(tokenNameRule('Claude Code')).toBe(true)
    expect(tokenNameRule('  ')).not.toBe(true)
    expect(tokenNameRule('x'.repeat(65))).not.toBe(true)
    expect(tokenNameRule('a\u0007b')).not.toBe(true)
  })

  it('turns a choice into an end time', () => {
    expect(expiryTime('none', '', NOW)).toBeNull()
    expect(expiryTime(30, '', NOW)).toBe(new Date(NOW + 30 * 86_400_000).toISOString())
    // a date lasts to the end of that day here
    expect(expiryTime('date', '2026-12-24', NOW)).toBe(
      new Date(2026, 11, 24, 23, 59, 59).toISOString(),
    )
    expect(expiryTime('date', '2026-11-14', NOW)).toBe(
      new Date(2026, 10, 14, 23, 59, 59).toISOString(),
    )
  })

  it('has no end time for a missing or past date', () => {
    expect(expiryTime('date', '', NOW)).toBeUndefined()
    expect(expiryTime('date', '2026-11-13', NOW)).toBeUndefined()
    expect(expiryTime('date', 'morgen', NOW)).toBeUndefined()
  })

  it('names the local day', () => {
    expect(localDay(NOW)).toBe('2026-11-14')
  })
})
