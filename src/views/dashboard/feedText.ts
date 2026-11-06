import type { ActivityPerson, FeedEntry } from '@/api'

/** "Anna", "Anna and Ben", "Anna, Ben and 2 others" */
export function peopleText(people: readonly ActivityPerson[]): string {
  const names = people.map((p) => p.displayName || p.username || 'Someone')
  if (names.length === 0) return 'Someone'
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  const others = names.length - 2
  return `${names[0]}, ${names[1]} and ${others === 1 ? '1 other' : `${others} others`}`
}

function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

/** The name of the item at `path`, without `.md` like in the tree. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
}

/** What happened: "edited", "created", "renamed", "moved" or "deleted". */
export function verbOf(entry: FeedEntry): string {
  if (entry.kind === 'moved')
    return entry.oldPath !== undefined && folderOf(entry.oldPath) === folderOf(entry.path)
      ? 'renamed'
      : 'moved'
  return entry.kind
}

/** Where, and more about what: the folder, where it came from, and what an edit touched. */
export function detailsOf(entry: FeedEntry): string {
  const parts: string[] = []
  const folder = folderOf(entry.path)
  const verb = verbOf(entry)
  if (verb === 'renamed') parts.push(`was “${nameOf(entry.oldPath ?? '')}”`)
  else if (verb === 'moved') parts.push(`from ${folderOf(entry.oldPath ?? '') || 'the top folder'}`)
  if (verb !== 'moved') parts.push(folder ? `in ${folder}` : 'in the top folder')
  if (verb === 'moved') parts.push(`to ${folder || 'the top folder'}`)
  const summary = entry.summary
  if (summary) {
    parts.push(`+${summary.linesAdded} −${summary.linesRemoved}`)
    if (summary.headings.length > 0) parts.push(summary.headings.join(', '))
  }
  return parts.join(' · ')
}
