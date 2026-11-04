import { plural } from './names'

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

/** "5 minutes ago", "yesterday", … up to a week, then the date. */
export function formatWhen(iso: string, now = Date.now()): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return iso
  const seconds = Math.round((time - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return 'just now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), 'day')
  return absolute.format(time)
}

export function formatDate(iso: string): string {
  const time = new Date(iso).getTime()
  return Number.isNaN(time) ? iso : absolute.format(time)
}

/** Like `formatDate`, with a dash for a missing or broken time. */
export function formatTime(iso: string | null | undefined): string {
  const time = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(time) ? '–' : absolute.format(time)
}

/** "Synced 3 hours ago", in whole units like the Android app. */
export function syncedAgo(time: number, now = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000)
  if (minutes < 1) return 'Synced just now'
  if (minutes < 60) return `Synced ${plural(minutes, 'minute')} ago`
  if (minutes < 24 * 60) return `Synced ${plural(Math.floor(minutes / 60), 'hour')} ago`
  return `Synced ${plural(Math.floor(minutes / (24 * 60)), 'day')} ago`
}

/** The line about how current the shown data is; null if there is nothing to say yet. */
export function syncStatusText(
  lastSync: number | null,
  notConnected: boolean,
  now = Date.now(),
): string | null {
  const synced = lastSync === null ? null : syncedAgo(lastSync, now)
  if (!notConnected) return synced
  return synced === null ? 'Not connected' : `Not connected · ${synced}`
}
