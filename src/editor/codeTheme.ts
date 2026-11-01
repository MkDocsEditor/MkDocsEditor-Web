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

/** Gives list and quote markers their own highlighting tags (the parser lumps all marks). */
export const markdownMarkTags = {
  props: [styleTags({ ListMark: listMark, QuoteMark: quoteMark })],
}

const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace'

/**
 * Syntax colours of the editor, for Markdown and the code inside fenced blocks. The colours
 * follow the app theme through CSS variables (`plugins/codeColors.ts`).
 */
export const codeHighlightStyle = HighlightStyle.define([
  // Markdown
  { tag: t.heading1, color: c('heading'), fontWeight: '700', fontSize: '1.15em' },
  { tag: t.heading2, color: c('heading'), fontWeight: '700', fontSize: '1.08em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: c('heading'), fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: c('link') },
  { tag: t.url, color: c('url'), textDecoration: 'underline' },
  { tag: t.monospace, color: c('string'), backgroundColor: c('background'), borderRadius: '3px' },
  { tag: t.quote, color: c('comment'), fontStyle: 'italic' },
  { tag: [listMark, quoteMark], color: c('keyword'), fontWeight: '700' },
  { tag: t.processingInstruction, color: c('comment') },
  { tag: t.labelName, color: c('annotation') },
  { tag: t.contentSeparator, color: c('comment'), fontWeight: '700' },
  { tag: t.atom, color: c('keyword') },
  { tag: [t.escape, t.character], color: c('keyword') },

  // HTML in Markdown
  { tag: [t.tagName, t.angleBracket], color: c('tag') },
  { tag: t.attributeName, color: c('attribute') },
  { tag: t.attributeValue, color: c('string') },
  { tag: t.documentMeta, color: c('annotation') },

  // Code
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: c('comment'),
    fontStyle: 'italic',
  },
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword],
    color: c('keyword'),
  },
  { tag: [t.bool, t.null, t.self], color: c('keyword') },
  { tag: [t.string, t.special(t.string), t.regexp], color: c('string') },
  { tag: [t.number, t.integer, t.float], color: c('number') },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
    ],
    color: c('function'),
  },
  {
    tag: [t.propertyName, t.definition(t.propertyName), t.special(t.variableName)],
    color: c('property'),
  },
  {
    tag: [t.standard(t.variableName), t.constant(t.variableName), t.standard(t.typeName)],
    color: c('constant'),
  },
  { tag: [t.meta, t.annotation, t.modifier], color: c('annotation') },
  { tag: t.inserted, color: c('inserted') },
  { tag: t.deleted, color: c('deleted') },
  { tag: t.invalid, color: c('deleted') },
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
  '.cm-content': { padding: '12px 0', caretColor: 'rgb(var(--v-theme-primary))' },
  '.cm-line': { padding: '0 16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid rgb(var(--v-theme-primary))' },
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
  '.cm-admonition': { color: c('annotation'), fontWeight: '700' },
  '.cm-placeholder': { color: c('comment') },

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
