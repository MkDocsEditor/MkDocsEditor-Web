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

/** Inline Markdown of a heading as plain text (what the slug is made of). */
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
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
