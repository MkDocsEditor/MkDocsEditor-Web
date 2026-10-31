import { local, readJson, writeJson } from './storage'

/**
 * When to suggest a passkey again after someone chose "Later". Kept per username in this
 * browser only, so a skipped suggestion comes back at most every few days.
 */
const KEY = 'mkdocseditor.passkeyReminder'
export const REMINDER_PAUSE_DAYS = 3

type Reminders = Record<string, string>

function read(): Reminders {
  return readJson<Reminders>(local(), KEY) ?? {}
}

function key(username: string): string {
  return username.trim().toLowerCase()
}

/** True unless the suggestion was put off and the pause is not over yet. */
export function passkeyReminderDue(username: string, now = Date.now()): boolean {
  const until = read()[key(username)]
  return !until || Number.isNaN(Date.parse(until)) || Date.parse(until) <= now
}

/** True when the user chose "Later" at least once (the account page then shows a reminder). */
export function passkeyReminderSkipped(username: string): boolean {
  return key(username) in read()
}

export function snoozePasskeyReminder(username: string, now = Date.now()): void {
  const until = new Date(now + REMINDER_PAUSE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  writeJson(local(), KEY, { ...read(), [key(username)]: until })
}

/** After a passkey was created: nothing left to remind of. */
export function clearPasskeyReminder(username: string): void {
  const next = read()
  delete next[key(username)]
  writeJson(local(), KEY, next)
}
