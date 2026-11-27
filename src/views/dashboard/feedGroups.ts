import type { ActivityPerson, FeedEntry } from '@/api'

/**
 * A row of the feed: one entry, or the edits of one page folded together. The same rule as on
 * Android, so that both show the same rows:
 *
 * - Walk the loaded entries, newest first. An `edited` entry joins the group open for its `path`,
 *   else it starts a new group at its place, open for its `path`.
 * - Any other kind (`created`, `moved`, `deleted`) is a row of its own. It closes the group open
 *   for its `path`, and a `moved` entry also the one for its `oldPath`: the next older edit there
 *   starts a new group. Edits are never folded across it.
 * - A group sits at its newest entry, so it does not move when older entries (the next page)
 *   join it. A group of one shows as the entry alone.
 */
export interface FeedGroup {
  /** Newest first; at least one. */
  entries: FeedEntry[]
}

export function groupFeed(entries: readonly FeedEntry[]): FeedGroup[] {
  const groups: FeedGroup[] = []
  const open = new Map<string, FeedGroup>()
  for (const entry of entries) {
    if (entry.kind === 'edited') {
      const group = open.get(entry.path)
      if (group) group.entries.push(entry)
      else {
        const started = { entries: [entry] }
        groups.push(started)
        open.set(entry.path, started)
      }
      continue
    }
    groups.push({ entries: [entry] })
    open.delete(entry.path)
    if (entry.kind === 'moved' && entry.oldPath !== undefined) open.delete(entry.oldPath)
  }
  return groups
}

/** Who a person is across entries: the account, or the name without one (`:disk`, `:server`). */
const personKey = (p: ActivityPerson) => p.accountId ?? `name:${p.displayName}`

/** The authors of a group: the oldest entry first, each entry's in its own order, once each. */
export function groupAuthors(group: FeedGroup): ActivityPerson[] {
  const seen = new Map<string, ActivityPerson>()
  for (const entry of [...group.entries].reverse())
    for (const author of entry.authors)
      if (!seen.has(personKey(author))) seen.set(personKey(author), author)
  return [...seen.values()]
}

/** The headings of a group: the newest entry first, each entry's in its own order, once each. */
export function groupHeadings(group: FeedGroup): string[] {
  return [...new Set(group.entries.flatMap((e) => e.summary?.headings ?? []))]
}

/** Whether a group shows its entries: any of them was opened (a set of entry ids). */
export function isExpanded(group: FeedGroup, expanded: ReadonlySet<string>): boolean {
  return group.entries.some((e) => expanded.has(e.id))
}
