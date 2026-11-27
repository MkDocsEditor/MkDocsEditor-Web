import { describe, expect, it } from 'vitest'

import type { ActivityPerson, FeedEntry } from '@/api'

import { groupAuthors, groupFeed, groupHeadings, isExpanded } from './feedGroups'

const person = (name: string, accountId: string | undefined = name): ActivityPerson => ({
  ...(accountId ? { accountId } : {}),
  displayName: name,
  color: '#123456',
  avatar: null,
})

let minute = 59
/** An entry, one minute older than the one made before. */
function entry(
  id: string,
  path: string,
  kind: FeedEntry['kind'] = 'edited',
  more: Partial<FeedEntry> = {},
): FeedEntry {
  return {
    id,
    time: `2026-11-27T10:${String(minute--).padStart(2, '0')}:00Z`,
    kind,
    itemType: 'document',
    path,
    authors: [],
    ...more,
  }
}

const ids = (entries: readonly FeedEntry[]) =>
  groupFeed(entries).map((g) => g.entries.map((e) => e.id))

describe('groupFeed', () => {
  it('folds the edits of a page into one row, at its newest edit', () => {
    expect(
      ids([
        entry('a1', 'a.md'),
        entry('b1', 'b.md'),
        entry('a2', 'a.md'),
        entry('c1', 'c.md'),
        entry('a3', 'a.md'),
      ]),
    ).toEqual([['a1', 'a2', 'a3'], ['b1'], ['c1']])
  })

  it('never folds across another kind of entry for the page', () => {
    expect(
      ids([
        entry('a1', 'a.md'),
        entry('a-created', 'a.md', 'created'),
        entry('a2', 'a.md'),
        entry('a3', 'a.md'),
        entry('a-deleted', 'a.md', 'deleted'),
        entry('a4', 'a.md'),
      ]),
    ).toEqual([['a1'], ['a-created'], ['a2', 'a3'], ['a-deleted'], ['a4']])
  })

  it('ends the groups of both paths at a move', () => {
    expect(
      ids([
        entry('new1', 'new.md'),
        entry('old-new1', 'old.md'),
        entry('moved', 'new.md', 'moved', { oldPath: 'old.md' }),
        entry('new2', 'new.md'),
        entry('old1', 'old.md'),
      ]),
    ).toEqual([['new1'], ['old-new1'], ['moved'], ['new2'], ['old1']])
  })

  it('keeps a row where it is when older entries join it', () => {
    const first = [entry('a1', 'a.md'), entry('b1', 'b.md'), entry('a2', 'a.md')]
    const more = [entry('c1', 'c.md'), entry('a3', 'a.md'), entry('b2', 'b.md')]
    const before = groupFeed(first).map((g) => g.entries[0]!.id)
    const after = groupFeed([...first, ...more]).map((g) => g.entries[0]!.id)
    expect(after.slice(0, before.length)).toEqual(before)
    expect(ids([...first, ...more])).toEqual([['a1', 'a2', 'a3'], ['b1', 'b2'], ['c1']])
  })
})

describe('a group', () => {
  it('lists its authors once each, the oldest edit first, each in its own order', () => {
    const anna = person('Anna')
    const ben = person('Ben')
    const disk = person('Disk', undefined)
    const group = groupFeed([
      entry('a1', 'a.md', 'edited', { authors: [ben, anna] }),
      entry('a2', 'a.md', 'edited', { authors: [disk, anna] }),
      entry('a3', 'a.md', 'edited', { authors: [anna] }),
    ])[0]!
    expect(groupAuthors(group).map((p) => p.displayName)).toEqual(['Anna', 'Disk', 'Ben'])
  })

  it('lists its headings once each, the newest edit first', () => {
    const summary = (headings: string[]) => ({ linesAdded: 1, linesRemoved: 0, headings })
    const group = groupFeed([
      entry('a1', 'a.md', 'edited', { summary: summary(['Backen']) }),
      entry('a2', 'a.md', 'edited', { summary: summary(['Zutaten', 'Backen']) }),
      entry('a3', 'a.md'),
    ])[0]!
    expect(groupHeadings(group)).toEqual(['Backen', 'Zutaten'])
  })

  it('stays open when an edit joins it, newer or older', () => {
    const opened = new Set(['a2'])
    const grown = groupFeed([entry('a0', 'a.md'), entry('a2', 'a.md'), entry('a3', 'a.md')])[0]!
    expect(isExpanded(grown, opened)).toBe(true)
    expect(isExpanded(groupFeed([entry('b1', 'b.md')])[0]!, opened)).toBe(false)
  })
})
