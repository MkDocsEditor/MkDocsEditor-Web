import { StateEffect, StateField } from '@codemirror/state'
import { EditorView, ViewPlugin, showTooltip } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'

import type { Blame, BlameBlock } from '@/api'
import { formatWhen } from '@/services/time'

/** How long the pointer rests on a line's gutter before its history shows. */
const HOVER_MS = 350

/** What a line's tooltip says: who and when, in words. */
export function describeLine(block: BlameBlock | undefined, now = Date.now()): string[] {
  if (!block) return ['Not in the history yet']
  const who = block.author
    ? block.agents.length > 0
      ? `${block.author.displayName} via ${block.agents.join(', ')}`
      : block.author.displayName
    : null
  if (block.pending) return [who ? `${who}, not in the history yet` : 'Not in the history yet']
  const lines = [[who, block.time ? formatWhen(block.time, now) : null].filter(Boolean).join(' · ')]
  const subject = block.message?.split('\n')[0] ?? ''
  // the backend's own message says nothing the line does not
  if (subject && !/^Update \S+$/.test(subject)) lines.push(subject)
  return lines
}

/** The block of a 1-based line. */
export function blockOf(blame: Blame, line: number): BlameBlock | undefined {
  return blame.blocks.find((block) => block.start <= line && line <= block.end)
}

const showLine = StateEffect.define<{ pos: number; text: string[] } | null>()

const lineTooltip = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(showLine)) {
        const shown = effect.value
        if (!shown) return null
        return {
          pos: Math.min(shown.pos, tr.state.doc.length),
          above: true,
          create() {
            const dom = document.createElement('div')
            dom.className = 'cm-line-history'
            dom.dataset.testid = 'line-history'
            shown.text.forEach((text, i) => {
              const row = document.createElement('div')
              if (i > 0) row.className = 'cm-line-history__message'
              row.textContent = text
              dom.append(row)
            })
            return { dom }
          },
        }
      }
    if (value && tr.docChanged) return { ...value, pos: tr.changes.mapPos(value.pos) }
    return value
  },
  provide: (field) => showTooltip.from(field),
})

/**
 * "Who wrote this line and when": resting the pointer on a line's gutter (line number, author
 * strip) shows the commit of the line, or that it is not in the history yet. `load` asks the
 * server; null means it cannot tell, and the gutter stays quiet.
 */
export function lineHistory(load: () => Promise<Blame | null>) {
  const plugin = ViewPlugin.fromClass(
    class {
      blame: Blame | null = null
      changedSince = false
      unsupported = false
      loading: Promise<void> | null = null
      timer: ReturnType<typeof setTimeout> | undefined
      line = 0

      constructor(readonly view: EditorView) {
        view.dom.addEventListener('mousemove', this.onMove)
        view.dom.addEventListener('mouseleave', this.onLeave)
      }

      update(update: { docChanged: boolean }) {
        if (update.docChanged) this.changedSince = true
      }

      destroy() {
        clearTimeout(this.timer)
        this.view.dom.removeEventListener('mousemove', this.onMove)
        this.view.dom.removeEventListener('mouseleave', this.onLeave)
      }

      onMove = (event: MouseEvent) => {
        if (this.unsupported) return
        const inGutter = (event.target as Element | null)?.closest?.('.cm-gutters')
        if (!inGutter) return this.hide()
        const block = this.view.lineBlockAtHeight(event.clientY - this.view.documentTop)
        const line = this.view.state.doc.lineAt(block.from).number
        if (line === this.line) return
        this.hide()
        this.line = line
        this.timer = setTimeout(() => void this.show(line), HOVER_MS)
      }

      onLeave = () => this.hide()

      hide() {
        clearTimeout(this.timer)
        this.line = 0
        if (this.view.state.field(lineTooltip, false))
          this.view.dispatch({ effects: showLine.of(null) })
      }

      async refresh(): Promise<void> {
        // asked again once the text changed; hovers come slowly enough
        if (this.blame && !this.changedSince) return
        this.loading ??= load()
          .then((blame) => {
            if (!blame) this.unsupported = true
            this.blame = blame
            // the author of new lines can take a moment to be known
            this.changedSince = blame?.blocks.some((b) => b.pending && !b.author) ?? false
          })
          .catch(() => undefined) // asked again on the next hover
          .finally(() => (this.loading = null))
        await this.loading
      }

      async show(line: number): Promise<void> {
        await this.refresh()
        if (this.line !== line || !this.blame) return
        if (line > this.view.state.doc.lines) return
        const pos = this.view.state.doc.line(line).from
        this.view.dispatch({
          effects: showLine.of({ pos, text: describeLine(blockOf(this.blame, line)) }),
        })
      }
    },
  )
  return [lineTooltip, plugin, lineHistoryTheme]
}

const lineHistoryTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-line-history': {
    padding: '4px 8px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.875rem',
    maxWidth: '360px',
  },
  '.cm-line-history__message': { opacity: '0.7' },
})
