import { maskNonReferences } from './references'

export interface Heading {
  level: number
  text: string
  /** The anchor MkDocs gives the heading (`toc` extension defaults, or `{#id}`). */
  id: string
  /** 1-based line. */
  line: number
}

/**
 * The default slug of Python-Markdown's `toc` extension, which MkDocs uses: accents removed,
 * other non-ASCII dropped, lower case, runs of spaces and dashes become one dash.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '-')
}

/** Removes HTML tags, repeated until none is left (`<<b>b>` must not leave `<b>`). */
function stripTags(text: string): string {
  let previous: string
  let current = text
  do {
    previous = current
    current = current.replace(/<[^<>]*>/g, '')
  } while (current !== previous)
  return current
}

/** Inline Markdown of a heading as plain text (what the slug is made of). */
function plain(text: string): string {
  const inline = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '')
  return stripTags(inline).trim()
}

/** The headings of a page with their anchors, skipping code blocks and front matter. */
export function headingsOf(markdown: string): Heading[] {
  // code blocks and front matter are blanked out, so only real headings match
  const masked = maskNonReferences(markdown).split('\n')
  const source = markdown.split('\n')
  const headings: Heading[] = []
  const used = new Map<string, number>()
  for (let i = 0; i < source.length; i++) {
    if (!/^ {0,3}#{1,6}(\s|$)/.test(masked[i]!)) continue
    const match = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(source[i]!)
    if (!match) continue
    let text = match[2]!
    let id = ''
    const attr = /\s*\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(text)
    if (attr) {
      id = attr[1]!
      text = text.slice(0, attr.index)
    }
    text = plain(text)
    if (!id) {
      const base = slugify(text) || 'section'
      const count = used.get(base) ?? 0
      used.set(base, count + 1)
      id = count === 0 ? base : `${base}_${count}`
    }
    headings.push({ level: match[1]!.length, text, id, line: i + 1 })
  }
  return headings
}

/** Lines of a section: its heading up to the line before the next heading of its level or above. */
export interface SectionLines {
  /** 1-based line of the heading. */
  from: number
  /** 1-based last line of the section, without the blank lines at its end. */
  to: number
}

/**
 * The section of the first of `names` that is a heading of the page (the first match if several
 * headings have that name), as the feed names them (`summary.headings`). Undefined if none is.
 */
export function sectionOf(markdown: string, names: readonly string[]): SectionLines | undefined {
  const headings = headingsOf(markdown)
  const key = (text: string) => plain(text).replace(/\s+/g, ' ')
  for (const name of names) {
    const index = headings.findIndex((h) => key(h.text) === key(name))
    if (index < 0) continue
    const heading = headings[index]!
    const next = headings.slice(index + 1).find((h) => h.level <= heading.level)
    const lines = markdown.split('\n')
    let to = next ? next.line - 1 : lines.length
    while (to > heading.line && !lines[to - 1]!.trim()) to--
    return { from: heading.line, to }
  }
  return undefined
}
