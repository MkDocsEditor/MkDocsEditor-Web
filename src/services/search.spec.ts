import { describe, expect, it } from 'vitest'

import { indexTree } from '@/stores/treeIndex'
import { sampleTree } from '@/test/fixtures'

import { findExcerpts, findMatches, isSearchable, searchWiki, sortByRelevance } from './search'
import type { SearchResult } from './search'

describe('findMatches', () => {
  it('takes the term literally and ignores case', () => {
    expect(findMatches('Äpfel und äpfel', 'ÄPFEL')).toEqual([
      [0, 5],
      [10, 15],
    ])
    expect(findMatches('a.b axb', 'a.b')).toEqual([[0, 3]])
    expect(findMatches('text', '')).toEqual([])
  })
})

describe('findExcerpts', () => {
  it('counts all matches and names the nearest heading above', () => {
    const page = '# Titel\n\nApfel und Apfel\n\n## Zweiter\n\n- noch ein Apfel\n'
    const { matchCount, excerpts } = findExcerpts(page, 'apfel')
    expect(matchCount).toBe(3)
    expect(excerpts.map((e) => e.heading)).toEqual(['Titel', 'Zweiter'])
    expect(excerpts[0]!.matches).toEqual([
      [0, 5],
      [10, 15],
    ])
  })

  it('names no heading for a match in a heading', () => {
    const { excerpts } = findExcerpts('# Eins\n\n# Apfel\n', 'apfel')
    expect(excerpts[0]!.heading).toBeNull()
  })

  it('takes 20 characters before and 70 after the first match', () => {
    const before = 'v'.repeat(30)
    const after = 'n'.repeat(100)
    const [excerpt] = findExcerpts(`${before}Apfel${after}`, 'apfel').excerpts
    expect(excerpt!.text).toBe(`${'v'.repeat(20)}Apfel${'n'.repeat(70)}`)
    expect(excerpt!.matches).toEqual([[20, 25]])
    expect(excerpt!.truncatedStart).toBe(true)
    expect(excerpt!.truncatedEnd).toBe(true)
  })

  it('skips line markers and does not count them as cut off', () => {
    const [excerpt] = findExcerpts('- Apfel', 'apfel').excerpts
    expect(excerpt).toMatchObject({ text: 'Apfel', truncatedStart: false, truncatedEnd: false })
  })

  it('never cuts an emoji in half', () => {
    const [excerpt] = findExcerpts(`😀${'v'.repeat(19)}Apfel`, 'apfel').excerpts
    expect(excerpt!.text.startsWith('😀')).toBe(true)
    expect(excerpt!.matches).toEqual([[21, 26]])
  })
})

describe('sortByRelevance', () => {
  const result = (name: string, matchCount = 0) =>
    ({ item: { name }, matchCount }) as unknown as SearchResult

  it('prefers the whole name, then its start, a part of it, then the text', () => {
    const sorted = sortByRelevance(
      [result('Zwei', 9), result('Mein Apfel'), result('Apfelkuchen'), result('apfel')],
      ' Apfel ',
    )
    expect(sorted.map((r) => r.item.name)).toEqual(['apfel', 'Apfelkuchen', 'Mein Apfel', 'Zwei'])
  })

  it('then more matches, then the name', () => {
    const sorted = sortByRelevance([result('b', 1), result('c', 5), result('a', 1)], 'apfel')
    expect(sorted.map((r) => r.item.name)).toEqual(['c', 'a', 'b'])
  })
})

describe('searchWiki', () => {
  const index = indexTree(sampleTree())
  const text = (id: string) => (id === 'd-index' ? 'Rezept für Kuchen' : undefined)

  it('finds pages by their text as well as items by their name', () => {
    const results = searchWiki(index, text, 'kuchen')
    const ids = results.map((r) => r.item.id)
    expect(ids).toContain('d-index')
    expect(ids).toContain('s-kuchen')
    expect(ids).toContain('d-apfel')
    const page = results.find((r) => r.item.id === 'd-index')!
    expect(page.matchCount).toBe(1)
    expect(page.path).toEqual([])
    expect(ids.indexOf('s-kuchen')).toBeLessThan(ids.indexOf('d-index'))
  })

  it('does not search for terms that are too short, or the root', () => {
    expect(isSearchable(' a ')).toBe(false)
    expect(searchWiki(index, text, 'k')).toEqual([])
    expect(searchWiki(index, text, 'docs')).toEqual([])
  })
})
