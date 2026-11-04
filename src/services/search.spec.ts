import { describe, expect, it } from 'vitest'

import { indexTree } from '@/stores/treeIndex'
import { sampleTree } from '@/test/fixtures'

import { findExcerpts, findMatches, isSearchable, searchWiki, sortByRelevance } from './search'
import type { SearchResult } from './search'

describe('findMatches', () => {
  it('ignores case and accents, and marks the original text', () => {
    expect(findMatches('Kürbis und KURBIS', 'kurbis')).toEqual([
      [0, 6],
      [11, 17],
    ])
    expect(findMatches('Kurbis', 'kürbis')).toEqual([[0, 6]])
  })

  it('includes a separate accent in the match', () => {
    const text = 'Ku\u0308rbis!'
    expect(findMatches(text, 'kurbis')).toEqual([[0, 7]])
    expect(findMatches('Ku\u0308', 'ku')).toEqual([[0, 3]])
  })

  it('finds each word in any order and merges overlaps', () => {
    expect(findMatches('Kuchen mit Apfel', 'apfel kuchen')).toEqual([
      [0, 6],
      [11, 16],
    ])
    expect(findMatches('abcd', 'abc bcd')).toEqual([[0, 4]])
  })

  it('takes special characters literally', () => {
    expect(findMatches('a.b axb', 'a.b')).toEqual([[0, 3]])
    expect(findMatches('text', '')).toEqual([])
    expect(findMatches('text', '   ')).toEqual([])
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

  it('finds names and text without accents and in any word order', () => {
    expect(searchWiki(index, text, 'kurbis').map((r) => r.item.id)).toEqual(['d-suppe'])
    const results = searchWiki(index, text, 'kuchen rezept')
    expect(results.map((r) => r.item.id)).toContain('d-index')
    expect(results.find((r) => r.item.id === 'd-index')!.matchCount).toBe(2)
  })

  it('needs every word, in the name or the text of a page', () => {
    const inBoth = (id: string) => (id === 'd-suppe' ? 'mit Ingwer' : undefined)
    expect(searchWiki(index, inBoth, 'kurbis ingwer').map((r) => r.item.id)).toEqual(['d-suppe'])
    expect(searchWiki(index, inBoth, 'kurbis pfeffer')).toEqual([])
  })

  it('does not search for terms that are too short, or the root', () => {
    expect(isSearchable(' a ')).toBe(false)
    expect(searchWiki(index, text, 'k')).toEqual([])
    expect(searchWiki(index, text, 'docs')).toEqual([])
  })
})
