import type { MarkdownIt, StateBlock } from 'markdown-it'

/**
 * MkDocs admonitions (`!!! note "Title"`) and collapsible blocks from pymdownx.details
 * (`??? note`, `???+ note` for initially open). The body is the following indented block.
 */
export function admonitionPlugin(md: MarkdownIt): void {
  const MARKER = /^(!!!|\?\?\?\+?)\s+([\w-]+)((?:\s+[\w-]+)*)(?:\s+"(.*)")?\s*$/

  function rule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
    const start = state.bMarks[startLine]! + state.tShift[startLine]!
    const max = state.eMarks[startLine]!
    if (state.sCount[startLine]! - state.blkIndent >= 4) return false
    const line = state.src.slice(start, max)
    const match = MARKER.exec(line)
    if (!match) return false
    if (silent) return true

    const [, marker, kind, extraClasses, title] = match
    const collapsible = marker !== '!!!'
    const open = marker === '???+'

    // The body: following lines indented deeper than the marker (blank lines allowed).
    let nextLine = startLine + 1
    const bodyIndent = state.sCount[startLine]! + 4
    while (nextLine < endLine) {
      const isEmpty = state.isEmpty(nextLine)
      if (!isEmpty && state.sCount[nextLine]! < bodyIndent) break
      nextLine++
    }
    // Do not swallow trailing blank lines.
    while (nextLine > startLine + 1 && state.isEmpty(nextLine - 1)) nextLine--

    const classes = ['admonition', kind!, ...(extraClasses ?? '').split(/\s+/).filter(Boolean)]
    const heading = title ?? kind!.charAt(0).toUpperCase() + kind!.slice(1)

    const openToken = state.push('admonition_open', collapsible ? 'details' : 'div', 1)
    openToken.block = true
    openToken.attrSet('class', classes.join(' '))
    if (open) openToken.attrSet('open', '')
    openToken.map = [startLine, nextLine]
    openToken.info = collapsible ? 'details' : 'div'

    if (heading !== '') {
      const titleOpen = state.push('admonition_title_open', collapsible ? 'summary' : 'p', 1)
      titleOpen.attrSet('class', 'admonition-title')
      const inline = state.push('inline', '', 0)
      inline.content = heading
      inline.map = [startLine, startLine + 1]
      inline.children = []
      state.push('admonition_title_close', collapsible ? 'summary' : 'p', -1)
    }

    const oldParent = state.parentType
    const oldLineMax = state.lineMax
    const oldBlkIndent = state.blkIndent
    state.parentType = 'blockquote' as typeof state.parentType
    state.lineMax = nextLine
    state.blkIndent = bodyIndent
    state.md.block.tokenize(state, startLine + 1, nextLine)
    state.blkIndent = oldBlkIndent
    state.lineMax = oldLineMax
    state.parentType = oldParent

    state.push('admonition_close', collapsible ? 'details' : 'div', -1).block = true
    state.line = nextLine
    return true
  }

  md.block.ruler.before('fence', 'admonition', rule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
}
