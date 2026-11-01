/**
 * Finds the references of a Markdown text the way the backend does (`docs/references.md`
 * section 2): links, images, reference definitions and HTML `href`/`src` attributes, outside of
 * fenced code, inline code, HTML comments and front matter. External URLs and anchors are left
 * out. The client uses it for the open page, while it is being typed (and offline).
 */

export type ReferenceKind = 'link' | 'image' | 'definition' | 'html'

export interface TextReference {
  kind: ReferenceKind
  /** As written, including `?query` and `#anchor`, without angle brackets. */
  destination: string
  /** Offsets of the destination in the text. */
  from: number
  to: number
  /** 1-based line of the destination. */
  line: number
}

/** Replaces the parts that hold no references with spaces (same length, same line breaks). */
export function maskNonReferences(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  let masked = text
  const front = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(masked)
  if (front) masked = blank(front[0]) + masked.slice(front[0].length)
  masked = masked.replace(/<!--[\s\S]*?(?:-->|$)/g, blank)

  // fenced code: ``` or ~~~ (at least three), also indented inside lists and admonitions
  const lines = masked.split('\n')
  let fence: { char: string; length: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const open = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
      lines[i] = blank(line)
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.length) fence = null
    } else if (open) {
      fence = { char: open[1]![0]!, length: open[1]!.length }
      lines[i] = blank(line)
    }
  }
  masked = lines.join('\n')

  // inline code spans: a run of backticks up to the same run
  masked = masked.replace(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, blank)
  return masked
}

const INLINE =
  /(!?)\[(?:[^[\]\n]|\[[^[\]\n]*\])*\]\(\s*(<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g
const DEFINITION = /^ {0,3}\[(?!\^)([^\]\n]+)\]:[ \t]*(<[^<>\n]*>|\S+)/gm
const HTML =
  /<(?:a|img|source|video|audio)\b[^>]*?\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi

/** True for destinations that point outside the wiki or only into the same page. */
export function isExternal(destination: string): boolean {
  return (
    destination === '' ||
    destination.startsWith('#') ||
    destination.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(destination)
  )
}

export function findReferences(text: string): TextReference[] {
  const masked = maskNonReferences(text)
  const refs: TextReference[] = []
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (pos: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid]! <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  const add = (kind: ReferenceKind, raw: string, at: number) => {
    let destination = raw
    let from = at
    if (destination.startsWith('<') && destination.endsWith('>')) {
      destination = destination.slice(1, -1)
      from++
    }
    if (isExternal(destination)) return
    refs.push({ kind, destination, from, to: from + destination.length, line: lineOf(from) })
  }

  INLINE.lastIndex = 0
  for (let m = INLINE.exec(masked); m; m = INLINE.exec(masked)) {
    const raw = m[2]!
    const at = m.index + m[0].lastIndexOf(raw, m[0].length - 1)
    add(m[1] ? 'image' : 'link', raw, at)
    // look again inside the link text: `[![logo](a.png)](b.md)` has two references
    INLINE.lastIndex = m.index + m[1]!.length + 1
  }
  for (const m of masked.matchAll(DEFINITION)) {
    const raw = m[2]!
    add('definition', raw, m.index + m[0].length - raw.length)
  }
  for (const m of masked.matchAll(HTML)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? ''
    const quote = m[1] !== undefined || m[2] !== undefined ? 1 : 0
    add('html', raw, m.index + m[0].length - raw.length - quote)
  }
  refs.sort((a, b) => a.from - b.from)
  // the same destination found twice at one place (nested scan) counts once
  return refs.filter((r, i) => i === 0 || r.from !== refs[i - 1]!.from)
}
