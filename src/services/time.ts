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
