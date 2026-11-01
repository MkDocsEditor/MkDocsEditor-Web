import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { Tag, styleTags, tags as t } from '@lezer/highlight'

import { codeColor as c } from '@/plugins/codeColors'

/** List bullets and numbers, so they stand out from the other markup characters. */
const listMark = Tag.define(t.processingInstruction)
/** The `>` of a quote. */
const quoteMark = Tag.define(t.processingInstruction)
/** Images, which get their own colour (links are `t.link`). */
const image = Tag.define(t.link)

/** Own highlighting tags for list and quote markers and images (the parser lumps them). */
export const markdownMarkTags = {
  props: [styleTags({ ListMark: listMark, QuoteMark: quoteMark, 'Image/...': image })],
}

const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace'

/**
 * Syntax colours of the editor, for Markdown and the code inside fenced blocks. The roles match
 * the Android app: code tokens reuse the Markdown roles (keyword = heading, string = code,
 * number = image, function = link, property = emphasis, type and tag = html, comment = quote).
 * The colours follow the app theme through CSS variables (`plugins/codeColors.ts`).
 */
export const codeHighlightStyle = HighlightStyle.define([
  // Markdown
  { tag: t.heading1, color: c('heading'), fontWeight: '700', fontSize: '1.15em' },
  { tag: t.heading2, color: c('heading'), fontWeight: '700', fontSize: '1.08em' },
  {
    tag: [t.heading3, t.heading4, t.heading5, t.heading6],
    color: c('heading'),
    fontWeight: '700',
  },
  { tag: t.emphasis, color: c('emphasis'), fontStyle: 'italic' },
  { tag: t.strong, color: c('emphasis'), fontWeight: '700' },
  { tag: t.strikethrough, color: c('quote'), textDecoration: 'line-through' },
  { tag: t.link, color: c('link') },
  { tag: image, color: c('image') },
  { tag: t.url, color: c('link'), textDecoration: 'underline' },
  { tag: t.monospace, color: c('code'), backgroundColor: c('background'), borderRadius: '3px' },
  { tag: t.quote, color: c('quote'), fontStyle: 'italic' },
  { tag: [listMark, quoteMark], color: c('heading'), fontWeight: '700' },
  { tag: t.processingInstruction, color: c('quote') },
  { tag: t.labelName, color: c('meta') },
  { tag: t.contentSeparator, color: c('heading'), fontWeight: '700' },
  { tag: t.atom, color: c('meta') },
  { tag: [t.escape, t.character], color: c('heading') },

  // HTML in Markdown
  { tag: [t.tagName, t.angleBracket], color: c('html') },
  { tag: t.attributeName, color: c('emphasis') },
  { tag: t.attributeValue, color: c('code') },
  { tag: t.documentMeta, color: c('meta') },

  // Code in fenced blocks
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: c('quote'),
    fontStyle: 'italic',
  },
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword],
    color: c('heading'),
  },
  { tag: [t.bool, t.null, t.self], color: c('heading') },
  { tag: [t.string, t.special(t.string), t.regexp], color: c('code') },
  { tag: [t.number, t.integer, t.float], color: c('image') },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.standard(t.variableName),
    ],
    color: c('link'),
  },
  {
    tag: [t.propertyName, t.definition(t.propertyName), t.special(t.variableName)],
    color: c('emphasis'),
  },
  {
    tag: [t.typeName, t.className, t.namespace, t.constant(t.variableName)],
    color: c('html'),
  },
  { tag: [t.meta, t.annotation, t.modifier], color: c('meta') },
  { tag: t.inserted, color: c('code') },
  { tag: [t.deleted, t.invalid], color: c('deleted') },
])

const codeBlockLine = Decoration.line({ class: 'cm-code-block' })

function codeBlockLines(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let lastLine = -1
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return
        const start = view.state.doc.lineAt(Math.max(node.from, from)).number
        const end = view.state.doc.lineAt(Math.min(node.to, to)).number
        for (let n = Math.max(start, lastLine + 1); n <= end; n++) {
          builder.add(view.state.doc.line(n).from, view.state.doc.line(n).from, codeBlockLine)
          lastLine = n
        }
        return false
      },
    })
  }
  return builder.finish()
}

/** A background behind fenced and indented code, like the code blocks of the preview. */
const codeBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = codeBlockLines(view)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = codeBlockLines(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/** `!!! note "Title"`, `??? tip` and `???+ warning`: the marker, the type and the title. */
export const ADMONITION = /^(?:!!!|\?\?\?\+?)[ \t]+[\w-]+(?:[ \t]+"[^"\n]*")?/gm

const admonitionMatcher = new MatchDecorator({
  regexp: ADMONITION,
  decoration: Decoration.mark({ class: 'cm-admonition' }),
})

const admonitions = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = admonitionMatcher.createDeco(view)
    }
    update(update: ViewUpdate): void {
      this.decorations = admonitionMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
    backgroundColor: 'rgb(var(--v-theme-surface))',
    color: c('text'),
  },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0', caretColor: c('cursor') },
  '.cm-line': { padding: '0 16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: `2px solid ${c('cursor')}` },
  '.cm-activeLine': { backgroundColor: c('activeLine') },
  '.cm-code-block': { backgroundColor: c('background') },
  '.cm-code-block.cm-activeLine': {
    backgroundColor: `color-mix(in srgb, ${c('background')} 70%, ${c('lineNumber')} 12%)`,
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: `${c('selection')} !important` },
  '.cm-searchMatch': { backgroundColor: c('searchMatch'), borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: c('searchMatchSelected') },
  '.cm-selectionMatch': { backgroundColor: c('selectionMatch') },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: c('selectionMatch'),
    outline: `1px solid ${c('lineNumber')}`,
  },
  '.cm-gutters': {
    backgroundColor: 'rgb(var(--v-theme-surface))',
    color: c('lineNumber'),
    border: 'none',
    borderRight: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '40px' },
  '.cm-activeLineGutter': { backgroundColor: c('activeLine'), color: c('lineNumberActive') },
  '.cm-admonition': { color: c('meta'), fontWeight: '700' },
  '.cm-placeholder': { color: c('quote') },

  // Search panel and tooltips in the app's colours (CodeMirror's own are light only).
  '.cm-panels': {
    backgroundColor: 'rgb(var(--v-theme-surface-light))',
    color: 'rgb(var(--v-theme-on-surface))',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
  },
  '.cm-textfield': {
    backgroundColor: 'rgb(var(--v-theme-surface))',
    color: 'rgb(var(--v-theme-on-surface))',
    border: '1px solid rgba(var(--v-border-color), 0.38)',
    borderRadius: '4px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'rgb(var(--v-theme-surface))',
    color: 'rgb(var(--v-theme-on-surface))',
    border: '1px solid rgba(var(--v-border-color), 0.38)',
    borderRadius: '4px',
  },
  '.cm-tooltip': {
    backgroundColor: 'rgb(var(--v-theme-surface-light))',
    color: 'rgb(var(--v-theme-on-surface))',
    border: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
  },
})

/** Theme, syntax colours and code block backgrounds of the Markdown editor. */
export function codeTheme(): Extension {
  return [editorTheme, syntaxHighlighting(codeHighlightStyle), codeBlocks, admonitions]
}

/** Line numbers, with the cursor's line highlighted. */
export function lineNumberGutter(): Extension {
  return [lineNumbers(), highlightActiveLineGutter()]
}
