import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import {
  FORMATS,
  admonition,
  formattingKeymap,
  runFormat,
  shortcutLabel,
  toggleHeading,
} from './formatting'
import type { Format } from './formatting'

/**
 * Text with the selection marked: `|` is the cursor, `«` and `»` the start and end of a
 * selection. Several selections are allowed.
 */
function state(marked: string): EditorState {
  const ranges = []
  let doc = ''
  let anchor = -1
  for (const ch of marked) {
    if (ch === '|') ranges.push(EditorSelection.cursor(doc.length))
    else if (ch === '«') anchor = doc.length
    else if (ch === '»') ranges.push(EditorSelection.range(anchor, doc.length))
    else doc += ch
  }
  return EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.length ? ranges : [EditorSelection.cursor(0)]),
    extensions: EditorState.allowMultipleSelections.of(true),
  })
}

function show(s: EditorState): string {
  let text = s.doc.toString()
  const ranges = [...s.selection.ranges].sort((a, b) => b.from - a.from)
  for (const r of ranges) {
    text = r.empty
      ? `${text.slice(0, r.from)}|${text.slice(r.from)}`
      : `${text.slice(0, r.from)}«${text.slice(r.from, r.to)}»${text.slice(r.to)}`
  }
  return text
}

function apply(format: Format, marked: string): string {
  const s = state(marked)
  const spec = format(s)
  if (!spec) return marked
  return show(s.update(spec).state)
}

describe('inline formats', () => {
  it.each([
    ['bold', 'a «word» b', 'a **«word»** b'],
    ['bold', 'a **«word»** b', 'a «word» b'],
    ['bold', 'a «**word**» b', 'a «word» b'],
    ['bold', 'a | b', 'a **|** b'],
    ['italic', 'a «word» b', 'a *«word»* b'],
    ['italic', 'a *«word»* b', 'a «word» b'],
    ['italic', '**«word»**', '***«word»***'],
    ['strikethrough', '«gone»', '~~«gone»~~'],
    ['strikethrough', '~~«gone»~~', '«gone»'],
    ['code', 'run «ls»', 'run `«ls»`'],
    ['code', 'run `«ls»`', 'run «ls»'],
  ] as const)('%s: %s', (name, input, expected) => {
    expect(apply(FORMATS[name], input)).toBe(expected)
  })

  it('formats every selection', () => {
    expect(apply(FORMATS.bold, '«a» and «b»')).toBe('**«a»** and **«b»**')
  })
})

describe('line formats', () => {
  it.each([
    ['bulletList', 'one|', '- one|'],
    ['bulletList', '- one|', 'one|'],
    ['bulletList', '«one\ntwo»', '«- one\n- two»'],
    ['bulletList', '«- one\n- two»', '«one\ntwo»'],
    ['bulletList', '1. one|', '- one|'],
    ['bulletList', '  nested|', '  - nested|'],
    ['orderedList', '«one\ntwo\nthree»', '«1. one\n2. two\n3. three»'],
    ['orderedList', '«1. one\n2. two»', '«one\ntwo»'],
    ['taskList', 'buy milk|', '- [ ] buy milk|'],
    ['taskList', '- [x] done|', 'done|'],
    ['taskList', '- item|', '- [ ] item|'],
    ['quote', '«a\n\nb»', '«> a\n\n> b»'],
    ['quote', '> quoted|', 'quoted|'],
  ] as const)('%s: %j', (name, input, expected) => {
    expect(apply(FORMATS[name], input)).toBe(expected)
  })

  it('leaves a selection that ends at a line start out of that line', () => {
    expect(apply(FORMATS.bulletList, '«one\n»two')).toBe('«- one»\ntwo')
  })

  it.each([
    [1, 'Title|', '# Title|'],
    [2, '# Title|', '## Title|'],
    [2, '## Title|', 'Title|'],
    [3, '«a\nb»', '### «a\n### b»'],
  ])('heading %i: %j', (level, input, expected) => {
    expect(apply(toggleHeading(level), input)).toBe(expected)
  })
})

describe('block formats', () => {
  it('inserts a code block on its own lines', () => {
    expect(apply(FORMATS.codeBlock, 'text|')).toBe('text\n```\n|\n```')
    expect(apply(FORMATS.codeBlock, '|')).toBe('```\n|\n```')
  })

  it('wraps the selected lines in a code block', () => {
    expect(apply(FORMATS.codeBlock, 'x\n«a\nb»\ny')).toBe('x\n```|\na\nb\n```\ny')
  })

  it('inserts a table with the first header selected', () => {
    expect(apply(FORMATS.table, '|')).toBe(
      '| «Column 1» | Column 2 |\n| -------- | -------- |\n|          |          |',
    )
  })

  it('inserts an admonition with the title selected', () => {
    expect(apply(admonition('warning'), 'a\n|')).toBe('a\n!!! warning "«Warning»"\n    ')
  })

  it('puts the selected lines into an admonition', () => {
    expect(apply(FORMATS.admonition, '«one\n\ntwo»')).toBe('!!! note "«Note»"\n    one\n\n    two')
  })

  it('inserts a horizontal rule after a blank line', () => {
    expect(apply(FORMATS.horizontalRule, 'text|')).toBe('text\n\n---\n|')
    expect(apply(FORMATS.horizontalRule, 'text\n\n|')).toBe('text\n\n---\n|')
    expect(apply(FORMATS.horizontalRule, '|')).toBe('---\n|')
  })

  it('makes the selection the link text and selects the URL', () => {
    expect(apply(FORMATS.link, 'see «docs»')).toBe('see [docs](«https://»)')
    expect(apply(FORMATS.link, 'see |')).toBe('see [«text»](https://)')
    expect(apply(FORMATS.image, '|')).toBe('![«description»](https://)')
  })
})

describe('runFormat and the keymap', () => {
  function view(doc: string, readOnly = false) {
    return new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.range(0, doc.length),
        extensions: [formattingKeymap(), EditorState.readOnly.of(readOnly)],
      }),
      parent: document.body,
    })
  }

  it('applies a format to an editable view', () => {
    const v = view('word')
    expect(runFormat(v, FORMATS.bold)).toBe(true)
    expect(v.state.doc.toString()).toBe('**word**')
    v.destroy()
  })

  it('does nothing in a read-only view', () => {
    const v = view('word', true)
    expect(runFormat(v, FORMATS.bold)).toBe(false)
    expect(v.state.doc.toString()).toBe('word')
    v.destroy()
  })

  it('formats on Ctrl+B', () => {
    const v = view('word')
    v.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    expect(v.state.doc.toString()).toBe('**word**')
    v.destroy()
  })
})

describe('shortcutLabel', () => {
  it('shows Ctrl on Linux and Windows, symbols on a Mac', () => {
    expect(shortcutLabel('Mod-Shift-k', false)).toBe('Ctrl+Shift+K')
    expect(shortcutLabel('Mod-b', true)).toBe('⌘B')
    expect(shortcutLabel('Mod-Alt-1', false)).toBe('Ctrl+Alt+1')
  })
})
