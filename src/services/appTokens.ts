import type { AppTokenScope } from '@/api'

/** Like the backend: 1 to 64 characters, no control characters. */
export function tokenNameRule(name: string): true | string {
  const trimmed = name.trim()
  if (trimmed === '' || [...trimmed].length > 64) return '1 to 64 characters'
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return 'No control characters'
  return true
}

export const SCOPE_CHOICES: { value: AppTokenScope; title: string }[] = [
  { value: 'write', title: 'Read and write' },
  { value: 'read', title: 'Read only' },
]

/** Days until the token expires; null: never. */
export const EXPIRY_CHOICES: { value: number | null; title: string }[] = [
  { value: 7, title: 'In 7 days' },
  { value: 30, title: 'In 30 days' },
  { value: 90, title: 'In 90 days' },
  { value: 365, title: 'In a year' },
  { value: null, title: 'Never' },
]

/** An expiry as chosen: none, a number of days from now, or a day in the calendar. */
export type ExpiryChoice = 'none' | 'date' | 7 | 30 | 90 | 365

export const EXPIRY_FIELD_CHOICES: { value: ExpiryChoice; title: string }[] = [
  { value: 'none', title: 'No fixed end' },
  { value: 7, title: 'In 7 days' },
  { value: 30, title: 'In 30 days' },
  { value: 90, title: 'In 90 days' },
  { value: 365, title: 'In a year' },
  { value: 'date', title: 'On a date…' },
]

/** `YYYY-MM-DD` of a time, in the local time zone, for a date input. */
export function localDay(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The end time of a choice as RFC 3339, null without one. A date lasts to the end of that day
 * here; undefined while the date is missing or not in the future.
 */
export function expiryTime(
  choice: ExpiryChoice,
  date: string,
  now = Date.now(),
): string | null | undefined {
  if (choice === 'none') return null
  if (choice !== 'date') return new Date(now + choice * 86_400_000).toISOString()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return undefined
  const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59)
  return end.getTime() > now ? end.toISOString() : undefined
}
