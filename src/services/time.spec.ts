import { describe, expect, it } from 'vitest'

import { formatTime, formatWhen, syncStatusText, syncedAgo } from './time'

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

describe('syncedAgo', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')
  const minute = 60_000

  it('counts whole minutes, hours and days', () => {
    expect(syncedAgo(now - 59_000, now)).toBe('Synced just now')
    expect(syncedAgo(now - minute, now)).toBe('Synced 1 minute ago')
    expect(syncedAgo(now - 59 * minute, now)).toBe('Synced 59 minutes ago')
    expect(syncedAgo(now - 60 * minute, now)).toBe('Synced 1 hour ago')
    expect(syncedAgo(now - 3 * 60 * minute, now)).toBe('Synced 3 hours ago')
    expect(syncedAgo(now - 24 * 60 * minute, now)).toBe('Synced 1 day ago')
    expect(syncedAgo(now - 400 * 24 * 60 * minute, now)).toBe('Synced 400 days ago')
  })

  it('says just now for a sync after the given time', () => {
    expect(syncedAgo(now + minute, now)).toBe('Synced just now')
  })
})

describe('syncStatusText', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')
  const threeHoursAgo = now - 3 * 3_600_000

  it('names the last sync and whether the server can be reached', () => {
    expect(syncStatusText(null, false, now)).toBeNull()
    expect(syncStatusText(null, true, now)).toBe('Not connected')
    expect(syncStatusText(threeHoursAgo, false, now)).toBe('Synced 3 hours ago')
    expect(syncStatusText(threeHoursAgo, true, now)).toBe('Not connected · Synced 3 hours ago')
  })
})
