import { EditorSelection, Prec } from '@codemirror/state'
import type { EditorState, Extension, SelectionRange, TransactionSpec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import type { EditorView, KeyBinding } from '@codemirror/view'

/**
 * Markdown formatting commands of the editor toolbar and keyboard shortcuts. Every command is a
 * pure function of the editor state (easy to test) that returns the transaction, or null when
 * it does not apply.
 */
export type Format = (state: EditorState) => TransactionSpec | null

const USER_EVENT = 'input.format'

/**
 * Wraps each selection in `marker` (`**`, `*`, `~~`, `` ` ``), or removes the marker when the
 * selection is already wrapped (inside or just outside the selection). An empty selection
 * inserts the pair and puts the cursor between.
 */
function toggleInline(marker: string): Format {
  const n = marker.length
  return (state) =>
    state.update(
      state.changeByRange((range) => {
        const { from, to } = range
        const doc = state.doc
        const before = doc.sliceString(Math.max(0, from - n), from)
        const after = doc.sliceString(to, to + n)
        const selected = doc.sliceString(from, to)
        // `**bold**` selected with the markers, or `*` inside `**` (italic in bold) is not a match
        if (
          selected.length >= 2 * n &&
          selected.startsWith(marker) &&
          selected.endsWith(marker) &&
          !isLongerRun(doc.sliceString(from, from + n + 1), marker)
        ) {
          return {
            changes: [
              { from, to: from + n },
              { from: to - n, to },
            ],
            range: EditorSelection.range(from, to - 2 * n),
          }
        }
        if (
          before === marker &&
          after === marker &&
          !isLongerRun(doc.sliceString(Math.max(0, from - n - 1), from), marker)
        ) {
          return {
            changes: [
              { from: from - n, to: from },
              { from: to, to: to + n },
            ],
            range: EditorSelection.range(from - n, to - n),
          }
        }
        return {
          changes: [
            { from, insert: marker },
            { from: to, insert: marker },
          ],
          range: EditorSelection.range(from + n, to + n),
        }
      }),
      { userEvent: USER_EVENT, scrollIntoView: true },
    )
}

/** `*` is a different marker when it is part of `**` (and `~` of `~~`). */
function isLongerRun(text: string, marker: string): boolean {
  if (marker.length !== 1) return false
  return text.length > marker.length && text.split('').every((c) => c === marker)
}

interface LineRange {
  from: number
  to: number
}

/** The lines touched by the selection (a selection ending at a line start excludes that line). */
function selectedLines(state: EditorState, range: SelectionRange): LineRange[] {
  const first = state.doc.lineAt(range.from)
  let last = state.doc.lineAt(range.to)
  if (range.to > range.from && range.to === last.from && last.number > first.number) {
    last = state.doc.line(last.number - 1)
  }
  const lines: LineRange[] = []
  for (let n = first.number; n <= last.number; n++) {
    const line = state.doc.line(n)
    lines.push({ from: line.from, to: line.to })
  }
  return lines
}

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/
const QUOTE_PREFIX = /^(\s*)>\s?/
const HEADING_PREFIX = /^(#{1,6})\s+/

type PrefixKind = 'bullet' | 'ordered' | 'task' | 'quote'

function prefixFor(kind: PrefixKind, index: number): string {
  switch (kind) {
    case 'bullet':
      return '- '
    case 'ordered':
      return `${index + 1}. `
    case 'task':
      return '- [ ] '
    case 'quote':
      return '> '
  }
}

function hasPrefix(kind: PrefixKind, text: string): boolean {
  switch (kind) {
    case 'bullet':
      return /^\s*[-*+]\s+(?!\[[ xX]\]\s)/.test(text)
    case 'ordered':
      return /^\s*\d+[.)]\s+/.test(text)
    case 'task':
      return /^\s*[-*+]\s+\[[ xX]\]\s+/.test(text)
    case 'quote':
      return QUOTE_PREFIX.test(text)
  }
}

/**
 * Turns the selected lines into a list (or quote), or back into plain lines when all of them
 * already are. Another list type is replaced (a bullet list becomes numbered).
 */
function toggleLinePrefix(kind: PrefixKind): Format {
  return (state) => {
    const ranges = state.selection.ranges
    const allLines = ranges.flatMap((r) => selectedLines(state, r))
    const nonEmpty = allLines.filter((l) => state.doc.sliceString(l.from, l.to).trim() !== '')
    const remove =
      nonEmpty.length > 0 &&
      nonEmpty.every((l) => hasPrefix(kind, state.doc.sliceString(l.from, l.to)))
    return state.update(
      state.changeByRange((range) => {
        const lines = selectedLines(state, range)
        const changes: { from: number; to?: number; insert?: string }[] = []
        let index = 0
        for (const line of lines) {
          const text = state.doc.sliceString(line.from, line.to)
          if (lines.length > 1 && text.trim() === '') continue
          const pattern = kind === 'quote' ? QUOTE_PREFIX : LIST_PREFIX
          const match = pattern.exec(text)
          const indent = match?.[1] ?? /^\s*/.exec(text)![0]
          const existing = match ? match[0].length : indent.length
          if (remove) {
            changes.push({ from: line.from + indent.length, to: line.from + existing })
          } else {
            changes.push({
              from: line.from + indent.length,
              to: line.from + existing,
              insert: prefixFor(kind, index),
            })
          }
          index++
        }
        const changeSet = state.changes(changes)
        const empty = range.empty
        const head = changeSet.mapPos(range.head, 1)
        return {
          changes: changeSet,
          range: empty
            ? EditorSelection.cursor(head)
            : EditorSelection.range(
                changeSet.mapPos(lines[0]!.from, -1),
                changeSet.mapPos(lines.at(-1)!.to, 1),
              ),
        }
      }),
      { userEvent: USER_EVENT, scrollIntoView: true },
    )
  }
}

/** Makes the selected lines a heading of `level`, or plain text when they already are one. */
export function toggleHeading(level: number): Format {
  const marker = `${'#'.repeat(level)} `
  return (state) =>
    state.update(
      state.changeByRange((range) => {
        const lines = selectedLines(state, range)
        const all = lines.every((l) => {
          const m = HEADING_PREFIX.exec(state.doc.sliceString(l.from, l.to))
          return m?.[1]?.length === level
        })
        const changes = lines.map((l) => {
          const text = state.doc.sliceString(l.from, l.to)
          const existing = HEADING_PREFIX.exec(text)?.[0].length ?? 0
          return { from: l.from, to: l.from + existing, insert: all ? '' : marker }
        })
        const changeSet = state.changes(changes)
        return {
          changes: changeSet,
          range: EditorSelection.range(
            changeSet.mapPos(range.anchor, 1),
            changeSet.mapPos(range.head, 1),
          ),
        }
      }),
      { userEvent: USER_EVENT, scrollIntoView: true },
    )
}

/**
 * Inserts `block` on lines of its own at the main selection (or replaces the selection). The
 * part of the block between `select[0]` and `select[1]` (offsets in `block`) is selected.
 */
function insertBlock(
  state: EditorState,
  block: string,
  select: [number, number] = [block.length, block.length],
): TransactionSpec {
  const { from, to } = state.selection.main
  const before = from > 0 ? state.doc.sliceString(from - 1, from) : '\n'
  const after = to < state.doc.length ? state.doc.sliceString(to, to + 1) : '\n'
  const lead = before === '\n' ? '' : '\n'
  const trail = after === '\n' ? '' : '\n'
  const insert = lead + block + trail
  const start = from + lead.length
  return {
    changes: { from, to, insert },
    selection: EditorSelection.range(start + select[0], start + select[1]),
    userEvent: USER_EVENT,
    scrollIntoView: true,
  }
}

/** A fenced code block around the selected lines, or an empty one with the cursor inside. */
const codeBlock: Format = (state) => {
  const range = state.selection.main
  if (range.empty) {
    const block = '```\n\n```'
    return insertBlock(state, block, [4, 4])
  }
  const lines = selectedLines(state, range)
  const from = lines[0]!.from
  const to = lines.at(-1)!.to
  const text = state.doc.sliceString(from, to)
  return {
    changes: { from, to, insert: `\`\`\`\n${text}\n\`\`\`` },
    selection: EditorSelection.cursor(from + 3),
    userEvent: USER_EVENT,
    scrollIntoView: true,
  }
}

/** `[text](url)`: the selection becomes the text, the URL placeholder is selected. */
function linkTemplate(image: boolean): Format {
  return (state) => {
    const range = state.selection.main
    const text = state.sliceDoc(range.from, range.to)
    const label = text || (image ? 'description' : 'text')
    const url = 'https://'
    const insert = `${image ? '!' : ''}[${label}](${url})`
    const start = range.from + (image ? 2 : 1)
    const selection = text
      ? EditorSelection.range(start + label.length + 2, start + label.length + 2 + url.length)
      : EditorSelection.range(start, start + label.length)
    return {
      changes: { from: range.from, to: range.to, insert },
      selection,
      userEvent: USER_EVENT,
      scrollIntoView: true,
    }
  }
}

/** A two-column table; the first header cell is selected. */
const table: Format = (state) =>
  insertBlock(
    state,
    '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |',
    [2, 10],
  )

export const ADMONITION_TYPES = [
  'note',
  'abstract',
  'info',
  'tip',
  'success',
  'question',
  'warning',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
] as const

/**
 * An admonition (`!!! type "Title"`). Selected lines become its content (indented by four
 * spaces); without a selection the title placeholder is selected.
 */
export function admonition(type: string = 'note'): Format {
  return (state) => {
    const range = state.selection.main
    const title = type.charAt(0).toUpperCase() + type.slice(1)
    const header = `!!! ${type} "${title}"`
    if (range.empty) {
      const block = `${header}\n    `
      return insertBlock(state, block, [header.length - title.length - 1, header.length - 1])
    }
    const lines = selectedLines(state, range)
    const from = lines[0]!.from
    const to = lines.at(-1)!.to
    const body = state.doc
      .sliceString(from, to)
      .split('\n')
      .map((line) => (line.trim() === '' ? '' : `    ${line}`))
      .join('\n')
    const insert = `${header}\n${body}`
    return {
      changes: { from, to, insert },
      selection: EditorSelection.range(
        from + header.length - title.length - 1,
        from + header.length - 1,
      ),
      userEvent: USER_EVENT,
      scrollIntoView: true,
    }
  }
}

/** A horizontal rule on a line of its own, after a blank line (so it does not make a heading). */
const horizontalRule: Format = (state) => {
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  const textBefore = state.doc.sliceString(line.from, from)
  const previous = line.number > 1 ? state.doc.line(line.number - 1).text : ''
  const needsBlank = textBefore.trim() !== '' || previous.trim() !== ''
  return insertBlock(state, `${needsBlank ? '\n' : ''}---\n`)
}

/** Runs a format command on a view (when it is editable). Returns whether it applied. */
export function runFormat(view: EditorView, format: Format): boolean {
  if (view.state.readOnly) return false
  const spec = format(view.state)
  if (!spec) return false
  view.dispatch(spec)
  view.focus()
  return true
}

export const FORMATS = {
  bold: toggleInline('**'),
  italic: toggleInline('*'),
  strikethrough: toggleInline('~~'),
  code: toggleInline('`'),
  codeBlock,
  bulletList: toggleLinePrefix('bullet'),
  orderedList: toggleLinePrefix('ordered'),
  taskList: toggleLinePrefix('task'),
  quote: toggleLinePrefix('quote'),
  link: linkTemplate(false),
  image: linkTemplate(true),
  table,
  admonition: admonition('note'),
  horizontalRule,
} satisfies Record<string, Format>

export type FormatName = keyof typeof FORMATS

/** Keyboard shortcuts (CodeMirror key names, `Mod` is Ctrl or Cmd). */
export const SHORTCUTS: Partial<Record<FormatName, string>> = {
  bold: 'Mod-b',
  italic: 'Mod-i',
  strikethrough: 'Mod-Shift-x',
  code: 'Mod-e',
  codeBlock: 'Mod-Alt-c',
  bulletList: 'Mod-Shift-8',
  orderedList: 'Mod-Shift-7',
  taskList: 'Mod-Shift-9',
  quote: 'Mod-Shift-.',
  link: 'Mod-k',
  image: 'Mod-Shift-k',
}

/** `Mod-Shift-k` as shown in a tooltip: `Ctrl+Shift+K`, or `⌘⇧K` on a Mac. */
export function shortcutLabel(key: string, mac = isMac()): string {
  const parts = key.split('-')
  const last = parts.pop()!.toUpperCase()
  const names: Record<string, [string, string]> = {
    Mod: ['Ctrl', '⌘'],
    Shift: ['Shift', '⇧'],
    Alt: ['Alt', '⌥'],
  }
  const mods = parts.map((p) => names[p]?.[mac ? 1 : 0] ?? p)
  return mac ? [...mods, last].join('') : [...mods, last].join('+')
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

/**
 * The formatting shortcuts, plus headings on `Mod-Alt-1` to `Mod-Alt-6`. `override` replaces a
 * command (the link and image pickers). High precedence: `Mod-i` would otherwise select the
 * syntax parent.
 */
export function formattingKeymap(
  override: () => Partial<Record<FormatName, () => boolean>> = () => ({}),
): Extension {
  const bindings: KeyBinding[] = Object.entries(SHORTCUTS).map(([name, key]) => ({
    key,
    preventDefault: true,
    run: (view: EditorView) => {
      const custom = override()[name as FormatName]
      if (custom) return view.state.readOnly ? false : custom()
      return runFormat(view, FORMATS[name as FormatName])
    },
  }))
  for (let level = 1; level <= 6; level++) {
    bindings.push({
      key: `Mod-Alt-${level}`,
      preventDefault: true,
      run: (view) => runFormat(view, toggleHeading(level)),
    })
  }
  return Prec.high(keymap.of(bindings))
}
