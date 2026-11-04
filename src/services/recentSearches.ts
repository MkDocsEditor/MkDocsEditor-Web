import { local, readJson, writeJson } from './storage'

const KEY = 'mkdocseditor.recentSearches'
const LIMIT = 10

export function loadRecentSearches(): string[] {
  const terms = readJson<unknown>(local(), KEY)
  return Array.isArray(terms) ? terms.filter((t): t is string => typeof t === 'string') : []
}

/**
 * Remembers a term, the last used one first. Terms that only differ in case count as the same
 * term, because the search ignores case too.
 *
 * @returns the terms including the new one
 */
export function rememberSearch(term: string): string[] {
  const cleaned = term.trim().replace(/\s+/g, ' ')
  const same = cleaned.toLowerCase()
  const terms = [cleaned, ...loadRecentSearches().filter((t) => t.toLowerCase() !== same)]
  const kept = terms.slice(0, LIMIT)
  writeJson(local(), KEY, kept)
  return kept
}
