import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'

import { ADMONITION, codeTheme, lineNumberGutter, markdownMarkTags } from './codeTheme'

let view: EditorView | null = null

function editor(doc: string, extra = false): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({ base: markdownLanguage, extensions: [markdownMarkTags] }),
      codeTheme(),
      extra ? lineNumberGutter() : [],
    ],
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  view = new EditorView({ state, parent: document.body })
  return view
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe('codeTheme', () => {
  it('puts a background behind the lines of fenced code', () => {
    const v = editor('Text\n\n```yaml\na: 1\n```\n\nMore')
    const lines = [...v.contentDOM.querySelectorAll('.cm-line')]
    const marked = lines.map((line) => line.classList.contains('cm-code-block'))
    expect(marked).toEqual([false, false, true, true, true, false, false])
  })

  it('marks admonition headers', () => {
    const v = editor('!!! warning "Careful"\n    Body\n\nNot !!! here')
    const marks = [...v.contentDOM.querySelectorAll('.cm-admonition')].map((m) => m.textContent)
    expect(marks).toEqual(['!!! warning "Careful"'])
  })

  it('styles headings, list markers and code spans with their own classes', () => {
    const v = editor('# Title\n\n- item with `code`')
    const classOf = (text: string) =>
      [...v.contentDOM.querySelectorAll('span')].find((s) => s.textContent === text)?.className
    const heading = classOf(' Title')
    const bullet = classOf('-')
    const code = classOf('code')
    const backtick = classOf('`')
    for (const cls of [heading, bullet, code, backtick]) expect(cls).toBeTruthy()
    expect(new Set([heading, bullet, code, backtick]).size).toBe(4)
  })

  it('shows line numbers when asked', () => {
    const v = editor('a\nb', true)
    expect(v.dom.querySelector('.cm-lineNumbers')).not.toBeNull()
  })
})

describe('ADMONITION', () => {
  it.each(['!!! note', '??? tip "Title"', '???+ danger', '!!! my-type'])('matches %s', (text) => {
    expect(text.match(new RegExp(ADMONITION.source))?.[0]).toBe(text)
  })

  it.each(['!! note', 'text !!! note', '!!!note'])('does not match %s', (text) => {
    expect(new RegExp(ADMONITION.source).test(text)).toBe(false)
  })
})
