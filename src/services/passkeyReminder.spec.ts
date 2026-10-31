import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearPasskeyReminder,
  passkeyReminderDue,
  passkeyReminderSkipped,
  REMINDER_PAUSE_DAYS,
  snoozePasskeyReminder,
} from './passkeyReminder'

const DAY = 24 * 60 * 60 * 1000

describe('passkey reminder', () => {
  beforeEach(() => localStorage.clear())

  it('is due until put off, then pauses for a few days per user', () => {
    const now = Date.parse('2026-11-01T10:00:00Z')
    expect(passkeyReminderDue('Anna', now)).toBe(true)
    expect(passkeyReminderSkipped('anna')).toBe(false)

    snoozePasskeyReminder('Anna', now)
    expect(passkeyReminderSkipped('anna')).toBe(true)
    expect(passkeyReminderDue('anna', now + DAY)).toBe(false)
    expect(passkeyReminderDue('anna', now + REMINDER_PAUSE_DAYS * DAY)).toBe(true)
    expect(passkeyReminderDue('ben', now)).toBe(true)

    clearPasskeyReminder('anna')
    expect(passkeyReminderSkipped('anna')).toBe(false)
  })

  it('survives broken storage values', () => {
    localStorage.setItem('mkdocseditor.passkeyReminder', '{nope')
    expect(passkeyReminderDue('anna')).toBe(true)
    snoozePasskeyReminder('anna')
    expect(passkeyReminderDue('anna')).toBe(false)
  })
})
