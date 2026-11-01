import type { MarkdownIt } from 'markdown-it'

const WELL_FORMED_END = /^[ \t]*(?:"[^"\n]*"[ \t]*|'[^'\n]*'[ \t]*|\([^()\n]*\)[ \t]*)?\)/
const QUOTED_TITLE = /[ \t]+(?:"[^"\n]*"|'[^'\n]*')$/

/** The position of the `)` that closes an inline destination starting at `start`, or -1. */
function closingParen(src: string, start: number, max: number): number {
  let depth = 0
  for (let i = start; i < max; i++) {
    const c = src[i]
    if (c === '\n') return -1
    if (c === '\\') i++
    else if (c === '(') depth++
    else if (c === ')' && depth-- === 0) return i
  }
  return -1
}

/**
 * Accepts raw spaces in inline link and image destinations: `![a](./my image.png)`. CommonMark
 * does not allow them, but Python-Markdown and so MkDocs do, and the backend's reference index
 * finds them too. A quoted title at the end stays a title. Reference definitions are unchanged.
 */
export function spacedLinksPlugin(md: MarkdownIt): void {
  const parse = md.helpers.parseLinkDestination
  md.helpers.parseLinkDestination = (src, start, max) => {
    const strict = parse(src, start, max)
    if (src[start] === '<' || !/\(\s*$/.test(src.slice(0, start))) return strict
    if (strict.ok && WELL_FORMED_END.test(src.slice(strict.pos, max))) return strict
    const closing = closingParen(src, start, max)
    if (closing < 0) return strict
    const destination = src.slice(start, closing).trimEnd().replace(QUOTED_TITLE, '')
    return {
      ok: true,
      pos: start + destination.length,
      str: md.utils.unescapeAll(destination),
    }
  }
}
