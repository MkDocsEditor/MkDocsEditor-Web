/** One line of a unified diff, ready to show. */
export interface DiffLine {
  kind: 'add' | 'del' | 'context' | 'hunk'
  text: string
  /** Line numbers in the old and new text (1-based), where the line exists there. */
  oldLine?: number
  newLine?: number
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

/** Parses a unified diff (as `git diff` writes it) into display lines, without file headers. */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const raw of diff.split('\n')) {
    const hunk = HUNK.exec(raw)
    if (hunk) {
      inHunk = true
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      lines.push({ kind: 'hunk', text: hunk[3]?.trim() ?? '' })
      continue
    }
    if (!inHunk) continue // diff --git, index, ---, +++
    if (raw.startsWith('+')) lines.push({ kind: 'add', text: raw.slice(1), newLine: newLine++ })
    else if (raw.startsWith('-'))
      lines.push({ kind: 'del', text: raw.slice(1), oldLine: oldLine++ })
    else if (raw.startsWith(' '))
      lines.push({ kind: 'context', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ })
    // "\ No newline at end of file" and the empty last line are skipped
  }
  return lines
}

/** Counts added and removed lines. */
export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.kind === 'add') added++
    else if (line.kind === 'del') removed++
  }
  return { added, removed }
}

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
