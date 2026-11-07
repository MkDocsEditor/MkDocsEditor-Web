import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FLASH_MS, flashLines } from './flashLines'

describe('flashLines', () => {
  afterEach(() => vi.useRealTimers())

  it('highlights the lines for a moment without changing text or selection', () => {
    vi.useFakeTimers()
    const view = new EditorView({
      state: EditorState.create({ doc: 'a\nb\nc\nd', selection: { anchor: 1 } }),
      parent: document.body,
    })
    flashLines(view, 2, 3)
    expect([...view.dom.querySelectorAll('.cm-flash-line')].map((l) => l.textContent)).toEqual([
      'b',
      'c',
    ])
    expect(view.state.doc.toString()).toBe('a\nb\nc\nd')
    expect(view.state.selection.main.anchor).toBe(1)
    vi.advanceTimersByTime(FLASH_MS)
    expect(view.dom.querySelectorAll('.cm-flash-line')).toHaveLength(0)
    view.destroy()
  })
})
