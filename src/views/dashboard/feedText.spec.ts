import { describe, expect, it } from 'vitest'

import type { ActivityPerson, FeedEntry } from '@/api'

import { detailsOf, nameOf, peopleText, verbOf } from './feedText'

const person = (displayName: string): ActivityPerson => ({
  displayName,
  color: '#123456',
  avatar: null,
})

const entry = (fields: Partial<FeedEntry>): FeedEntry => ({
  id: 'e',
  time: '2026-11-06T10:00:00Z',
  kind: 'edited',
  itemType: 'document',
  path: 'Rezepte/Kuchen.md',
  authors: [person('Anna')],
  ...fields,
})

describe('feed text', () => {
  it('names up to two people, then counts the others', () => {
    expect(peopleText([])).toBe('Someone')
    expect(peopleText([person('Anna')])).toBe('Anna')
    expect(peopleText([person('Anna'), person('Ben')])).toBe('Anna and Ben')
    expect(peopleText([person('Anna'), person('Ben'), person('Cleo')])).toBe(
      'Anna, Ben and 1 other',
    )
    expect(peopleText(['A', 'B', 'C', 'D'].map(person))).toBe('A, B and 2 others')
  })

  it('tells a rename from a move', () => {
    expect(verbOf(entry({ kind: 'moved', oldPath: 'Rezepte/Torte.md' }))).toBe('renamed')
    expect(verbOf(entry({ kind: 'moved', oldPath: 'Alt/Kuchen.md' }))).toBe('moved')
    expect(verbOf(entry({ kind: 'deleted' }))).toBe('deleted')
  })

  it('says where, and what an edit touched', () => {
    expect(nameOf('Rezepte/Kuchen.md')).toBe('Kuchen')
    expect(
      detailsOf(
        entry({ summary: { linesAdded: 3, linesRemoved: 1, headings: ['Zutaten', 'Backen'] } }),
      ),
    ).toBe('in Rezepte · +3 −1 · Zutaten, Backen')
    expect(detailsOf(entry({ kind: 'created', path: 'index.md' }))).toBe('in the top folder')
    expect(detailsOf(entry({ kind: 'moved', oldPath: 'Rezepte/Torte.md' }))).toBe(
      'was “Torte” · in Rezepte',
    )
    expect(detailsOf(entry({ kind: 'moved', oldPath: 'Kuchen.md' }))).toBe(
      'from the top folder · to Rezepte',
    )
  })
})
