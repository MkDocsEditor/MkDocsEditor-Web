import { describe, expect, it } from 'vitest'

import { formatTime, formatWhen } from './time'

describe('formatWhen', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')

  it('says how long ago, then the date', () => {
    expect(formatWhen('2026-10-31T11:59:30Z', now)).toBe('just now')
    expect(formatWhen('2026-10-31T11:55:00Z', now)).toBe('5 minutes ago')
    expect(formatWhen('2026-10-30T12:00:00Z', now)).toBe('yesterday')
    expect(formatWhen('2026-09-01T12:00:00Z', now)).toMatch(/2026/)
    expect(formatWhen('kaputt', now)).toBe('kaputt')
  })
})

describe('formatTime', () => {
  it('shows a dash for a missing or broken time', () => {
    expect(formatTime(null)).toBe('–')
    expect(formatTime('kaputt')).toBe('–')
    expect(formatTime('2026-10-31T12:00:00Z')).toMatch(/Oct 31, 2026/)
  })
})
