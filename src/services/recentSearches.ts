import { accountKey } from '@/sync/wikiCopy'

import { local, readJson, remove, writeJson } from './storage'

const LIMIT = 10

/** The history belongs to the account: the next user of this browser must not see it. */
function keyOf(account: string): string {
  return `mkdocseditor.recentSearches.${account}`
}

export function loadRecentSearches(): string[] {
  const terms = readJson<unknown>(local(), keyOf(accountKey()))
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
  writeJson(local(), keyOf(accountKey()), kept)
  return kept
}

export function clearRecentSearches(account: string): void {
  remove(local(), keyOf(account))
}
