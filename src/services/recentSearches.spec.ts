import { afterEach, describe, expect, it } from 'vitest'

import { loadRecentSearches, rememberSearch } from './recentSearches'

describe('recent searches', () => {
  afterEach(() => localStorage.clear())

  it('keeps the last 10, most recent first', () => {
    for (let i = 1; i <= 12; i++) rememberSearch(`term ${i}`)
    const terms = loadRecentSearches()
    expect(terms).toHaveLength(10)
    expect(terms[0]).toBe('term 12')
    expect(terms.at(-1)).toBe('term 3')
  })

  it('counts terms that differ only in case as one, and cleans up spaces', () => {
    rememberSearch('Apfel')
    rememberSearch('kuchen')
    expect(rememberSearch('  APFEL ')).toEqual(['APFEL', 'kuchen'])
    expect(rememberSearch(' zwei   Worte ')[0]).toBe('zwei Worte')
  })

  it('survives broken stored data', () => {
    localStorage.setItem('mkdocseditor.recentSearches', '{"a":1}')
    expect(loadRecentSearches()).toEqual([])
  })
})
