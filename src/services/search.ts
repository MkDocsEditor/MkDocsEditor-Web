import type { DocumentModel, ResourceModel, SectionModel } from '@/api'
import { headingsOf } from '@/markdown/headings'
import { ancestorsOf } from '@/stores/treeIndex'
import type { TreeIndex } from '@/stores/treeIndex'

/** Shorter terms would match nearly everything. */
export const MIN_SEARCH_LENGTH = 2

const CHARS_BEFORE_MATCH = 20
const CHARS_AFTER_MATCH = 70

/** List, quote and heading markers, which say nothing about the content. */
const LINE_MARKER = /^\s*(#{1,6}\s+|[-*+]\s+|>\s*|\d+\.\s+)?/

/** Start (inclusive) and end (exclusive) of a match. */
export type MatchRange = [number, number]

/** A line of a page around the first match in it. */
export interface Excerpt {
  text: string
  /** The matches, as indices of `text`. */
  matches: MatchRange[]
  /** The heading this line is below. */
  heading: string | null
  /** The line goes on before `text`. */
  truncatedStart: boolean
  /** The line goes on after `text`. */
  truncatedEnd: boolean
}

export interface SearchResult {
  item: DocumentModel | SectionModel | ResourceModel
  /** Names of the folders it is in, without the root. */
  path: string[]
  /** Matches in the text of a page, which can be more than the excerpts show. */
  matchCount: number
  excerpts: Excerpt[]
}

export function isSearchable(term: string): boolean {
  return term.trim().length >= MIN_SEARCH_LENGTH
}

/** All places of `term` in `text`, taken literally and ignoring case. */
export function findMatches(text: string, term: string): MatchRange[] {
  if (term === '') return []
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...text.matchAll(new RegExp(literal, 'giu'))].map((match): MatchRange => {
    const start = match.index
    return [start, start + match[0].length]
  })
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function excerptOf(line: string, matches: MatchRange[], heading: string | null): Excerpt {
  const contentStart = LINE_MARKER.exec(line)?.[0].length ?? 0
  const contentEnd = line.trimEnd().length
  const [firstStart, firstEnd] = matches[0]!

  let start = Math.max(firstStart - CHARS_BEFORE_MATCH, Math.min(contentStart, firstStart))
  let end = Math.max(Math.min(firstEnd + CHARS_AFTER_MATCH, contentEnd), firstEnd)
  // never cut an emoji in half
  if (start > 0 && isLowSurrogate(line.charCodeAt(start))) start--
  if (end < line.length && isHighSurrogate(line.charCodeAt(end - 1))) end++

  return {
    text: line.slice(start, end),
    matches: matches
      .filter(([from, to]) => from >= start && to <= end)
      .map(([from, to]): MatchRange => [from - start, to - start]),
    heading,
    truncatedStart: start > contentStart,
    truncatedEnd: end < contentEnd,
  }
}

/** The lines of a page that match, and how many matches it has in total. */
export function findExcerpts(
  content: string,
  term: string,
): { matchCount: number; excerpts: Excerpt[] } {
  if (term === '') return { matchCount: 0, excerpts: [] }
  const headings = headingsOf(content)
  let matchCount = 0
  const excerpts: Excerpt[] = []
  content.split('\n').forEach((line, index) => {
    const matches = findMatches(line, term)
    if (matches.length === 0) return
    matchCount += matches.length
    const lineNumber = index + 1
    const onHeading = headings.some((heading) => heading.line === lineNumber)
    const above = onHeading ? undefined : headings.filter((h) => h.line < lineNumber).at(-1)
    excerpts.push(excerptOf(line, matches, above?.text ?? null))
  })
  return { matchCount, excerpts }
}

/** The best matches first: the name before the content, the whole name before a part of it. */
export function sortByRelevance(results: SearchResult[], searchTerm: string): SearchResult[] {
  const term = searchTerm.trim().toLowerCase()
  const nameRank = (result: SearchResult): number => {
    const name = result.item.name.toLowerCase()
    if (name === term) return 0
    if (name.startsWith(term)) return 1
    return name.includes(term) ? 2 : 3
  }
  return [...results].sort(
    (a, b) =>
      nameRank(a) - nameRank(b) ||
      b.matchCount - a.matchCount ||
      a.item.name.toLowerCase().localeCompare(b.item.name.toLowerCase(), 'en'),
  )
}

/** Searches the names of all items and the text of all stored pages. */
export function searchWiki(
  index: TreeIndex,
  pageText: (id: string) => string | undefined,
  searchTerm: string,
): SearchResult[] {
  const term = searchTerm.trim()
  if (!isSearchable(term)) return []
  const results: SearchResult[] = []
  for (const item of index.items.values()) {
    if (!index.parents.has(item.id)) continue // the root itself
    const found =
      item.type === 'document'
        ? findExcerpts(pageText(item.id) ?? '', term)
        : { matchCount: 0, excerpts: [] }
    if (found.matchCount === 0 && findMatches(item.name, term).length === 0) continue
    results.push({
      item,
      path: ancestorsOf(index, item.id)
        .slice(1)
        .map((section) => section.name),
      ...found,
    })
  }
  return sortByRelevance(results, term)
}
