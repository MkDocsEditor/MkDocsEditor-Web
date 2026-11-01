/**
 * The link path algorithm of the backend (`docs/references.md` section 8): the relative
 * destination from a document to an item, as the pickers insert it and the backend writes it
 * when it rewrites references after a move. Both clients and the backend run the same test
 * vectors (`src/test/data/link-paths.json`, a copy of the backend's `docs/link-paths.json`).
 */

/** True for destinations that leave the wiki: `https:`, `mailto:`, `//host`, … */
export function isExternalUrl(href: string): boolean {
  return href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)
}

export interface LinkTarget {
  type: 'section' | 'document' | 'resource'
  /** Path relative to the docs folder, `/` separated (`""` for the root section). */
  path: string
  /** Sections: path of the index document (`index.md`, else `README.md`), or `""`. */
  index?: string
}

const ENCODED = new Set([
  '"',
  '#',
  '%',
  "'",
  '(',
  ')',
  '<',
  '>',
  '?',
  '[',
  '\\',
  ']',
  '^',
  '`',
  '{',
  '|',
  '}',
])

/** Percent-encodes control characters, spaces and the characters that end or confuse a link. */
export function encodeSegment(segment: string): string {
  let out = ''
  for (const ch of segment) {
    const code = ch.codePointAt(0)!
    if (code <= 0x20 || code === 0x7f || ENCODED.has(ch)) {
      out += `%${code.toString(16).toUpperCase().padStart(2, '0')}`
    } else {
      out += ch
    }
  }
  return out
}

function segments(path: string): string[] {
  return path === '' ? [] : path.split('/')
}

/** The destination of a link from the document at `from` to `target`, with an optional anchor. */
export function linkDestination(from: string, target: LinkTarget, anchor = ''): string {
  let targetPath = target.path
  let folder = false
  if (target.type === 'section') {
    if (target.index) targetPath = target.index
    else folder = true
  }
  const hash = anchor ? `#${encodeSegment(anchor)}` : ''

  if (!folder && targetPath === from) {
    return anchor ? hash : encodeSegment(from.slice(from.lastIndexOf('/') + 1))
  }

  const fromDir = segments(from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '')
  const to = segments(targetPath)
  let common = 0
  while (common < fromDir.length && common < to.length && fromDir[common] === to[common]) common++

  const parts = [
    ...Array<string>(fromDir.length - common).fill('..'),
    ...to.slice(common).map(encodeSegment),
  ]
  let result = parts.join('/')
  if (folder) {
    result += '/'
    if (result === '/') result = './'
  }
  if (parts[0]?.includes(':')) result = `./${result}`
  return result + hash
}
