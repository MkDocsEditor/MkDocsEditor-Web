import type { DocumentModel, ResourceModel, SectionModel } from '@/api'
import { headingsOf } from '@/markdown/headings'
import { ancestorsOf, normalize } from '@/stores/treeIndex'
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

/**
 * `text` without case and accents, for comparing. `starts` and `ends` give for every character of
 * `folded` the characters of `text` it came from, so a match can be marked in the original.
 */
function fold(text: string): { folded: string; starts: number[]; ends: number[] } {
  let folded = ''
  const starts: number[] = []
  const ends: number[] = []
  let position = 0
  for (const character of text) {
    const end = position + character.length
    const plain = normalize(character)
    // a separate accent belongs to the letter before it
    if (plain === '' && ends.length > 0) ends[ends.length - 1] = end
    for (let i = 0; i < plain.length; i++) {
      starts.push(position)
      ends.push(end)
    }
    folded += plain
    position = end
  }
  return { folded, starts, ends }
}

/** The words of a search term, each of which has to be found. */
function wordsOf(term: string): string[] {
  return normalize(term).split(/\s+/).filter(Boolean)
}

/** Every place of any word in `text`, as ranges of the original, overlaps included. */
function occurrences(text: string, words: string[]): MatchRange[] {
  const { folded, starts, ends } = fold(text)
  const ranges: MatchRange[] = []
  for (const word of words) {
    let from = folded.indexOf(word)
    while (from !== -1) {
      ranges.push([starts[from]!, ends[from + word.length - 1]!])
      from = folded.indexOf(word, from + word.length)
    }
  }
  return ranges
}

function merged(ranges: MatchRange[]): MatchRange[] {
  const result: MatchRange[] = []
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = result.at(-1)
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else result.push([from, to])
  }
  return result
}

/** All places of the words of `term` in `text`, ignoring case and accents, in text order. */
export function findMatches(text: string, term: string): MatchRange[] {
  return merged(occurrences(text, wordsOf(term)))
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
  const words = wordsOf(term)
  if (words.length === 0) return { matchCount: 0, excerpts: [] }
  const headings = headingsOf(content)
  let matchCount = 0
  const excerpts: Excerpt[] = []
  content.split('\n').forEach((line, index) => {
    const found = occurrences(line, words)
    if (found.length === 0) return
    matchCount += found.length
    const matches = merged(found)
    const lineNumber = index + 1
    const onHeading = headings.some((heading) => heading.line === lineNumber)
    const above = onHeading ? undefined : headings.filter((h) => h.line < lineNumber).at(-1)
    excerpts.push(excerptOf(line, matches, above?.text ?? null))
  })
  return { matchCount, excerpts }
}

/** The best matches first: the name before the content, the whole name before a part of it. */
export function sortByRelevance(results: SearchResult[], searchTerm: string): SearchResult[] {
  const words = wordsOf(searchTerm)
  const whole = words.join(' ')
  const nameRank = (result: SearchResult): number => {
    const name = normalize(result.item.name)
    if (name === whole) return 0
    if (name.startsWith(whole)) return 1
    return words.every((word) => name.includes(word)) ? 2 : 3
  }
  return [...results].sort(
    (a, b) =>
      nameRank(a) - nameRank(b) ||
      b.matchCount - a.matchCount ||
      a.item.name.toLowerCase().localeCompare(b.item.name.toLowerCase(), 'en'),
  )
}

/**
 * Searches the names of all items and the text of all stored pages. An item matches when every
 * word of the term is found; for a page, each word can be in its name or in its text.
 */
export function searchWiki(
  index: TreeIndex,
  pageText: (id: string) => string | undefined,
  searchTerm: string,
): SearchResult[] {
  const term = searchTerm.trim()
  if (!isSearchable(term)) return []
  const words = wordsOf(term)
  const results: SearchResult[] = []
  for (const item of index.items.values()) {
    if (!index.parents.has(item.id)) continue // the root itself
    const text = item.type === 'document' ? (pageText(item.id) ?? '') : ''
    const searched = `${normalize(item.name)}\n${normalize(text)}`
    if (!words.every((word) => searched.includes(word))) continue
    results.push({
      item,
      path: ancestorsOf(index, item.id)
        .slice(1)
        .map((section) => section.name),
      ...findExcerpts(text, term),
    })
  }
  return sortByRelevance(results, term)
}
