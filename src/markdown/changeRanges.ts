/**
 * Where the lines an edit changed are in the current text: the `ranges` of a feed entry's
 * summary (`docs/dashboard.md` of MkDocsEditor-Backend, "Changed lines").
 */

export interface ChangeRange {
  /** 1-based first changed line of the text after the edit. */
  line: number
  /** Added or changed lines from `line`; 0 for lines removed before `line`. */
  count: number
  /** The nearest heading at or above `line`, null without one. */
  heading: string | null
  /** Which heading with this text it is, from 1; 0 without a heading. */
  headingOccurrence: number
  /** `line` minus the line of the heading, or `line - 1` without a heading. */
  offset: number
}

/** Lines to highlight in the current text, 1-based and inclusive. */
export interface ChangeTarget {
  from: number
  to: number
  /**
   * Lines were removed here, with nothing in their place: a thin marker above line `from`, or
   * below the last line when `from` is past the end.
   */
  removal?: boolean
}

/** The lines as the backend counts them: split on `\n` only, a newline at the end adds none. */
export function linesOf(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (text.endsWith('\n')) lines.pop()
  return lines
}

/** The first 16 hex digits of SHA-256 over the UTF-8 text; undefined where browsers lack it. */
export async function textHash(text: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return undefined // only in secure contexts
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const ATX = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^ {0,3}(```|~~~)/

/** The ATX headings of the text as the backend recognizes them, with 1-based lines. */
export function atxHeadings(text: string): { text: string; line: number }[] {
  const lines = linesOf(text)
  const headings: { text: string; line: number }[] = []
  let start = 0
  if (lines[0]?.replace(/\r$/, '') === '---') {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)$/.test(l.replace(/\r$/, '')))
    if (end > 0) start = end + 1
  }
  let fence = ''
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, '')
    const opening = FENCE.exec(line)
    if (opening) {
      if (!fence) fence = opening[1]!
      else if (fence === opening[1]) fence = ''
      continue
    }
    if (fence) continue
    const match = ATX.exec(line)
    if (match) headings.push({ text: (match[1] ?? '').trim(), line: i + 1 })
  }
  return headings
}

/**
 * The ranges in the current text: as they are while its hash is the one of the edit, else by
 * their heading and offset, else by their line, clamped to the text.
 */
export function placeRanges(
  text: string,
  ranges: readonly ChangeRange[],
  hashMatches: boolean,
): ChangeTarget[] {
  const count = linesOf(text).length
  const headings = hashMatches ? [] : atxHeadings(text)
  return ranges.map((range) => {
    let line = range.line
    if (!hashMatches && range.heading !== null) {
      const same = headings.filter((h) => h.text === range.heading)
      const heading = same[range.headingOccurrence - 1] ?? same[0]
      if (heading) line = heading.line + range.offset
    }
    if (range.count === 0) {
      const from = Math.max(1, Math.min(line, count + 1))
      return { from, to: from, removal: true }
    }
    const from = Math.max(1, Math.min(line, Math.max(count, 1)))
    return { from, to: Math.max(from, Math.min(from + range.count - 1, count)) }
  })
}
