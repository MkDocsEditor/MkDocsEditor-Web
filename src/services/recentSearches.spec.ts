import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { user } from '@/test/fixtures'

import { clearRecentSearches, loadRecentSearches, rememberSearch } from './recentSearches'

describe('recent searches', () => {
  beforeEach(() => setActivePinia(createPinia()))
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
    localStorage.setItem('mkdocseditor.recentSearches.', '{"a":1}')
    expect(loadRecentSearches()).toEqual([])
  })

  it('keeps the terms of each account apart', () => {
    rememberSearch('ohne Konto')
    const auth = useAuthStore()
    auth.signedIn(user({ id: 'a1', username: 'anna' }))
    expect(loadRecentSearches()).toEqual([])
    rememberSearch('von Anna')
    auth.signedIn(user({ id: 'b2', username: 'ben' }))
    expect(loadRecentSearches()).toEqual([])
    auth.signedIn(user({ id: 'a1', username: 'anna' }))
    expect(loadRecentSearches()).toEqual(['von Anna'])
    clearRecentSearches('a1')
    expect(loadRecentSearches()).toEqual([])
  })
})
