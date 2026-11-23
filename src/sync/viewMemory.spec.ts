import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  VIEW_LIMIT,
  clearViews,
  forgetViews,
  moveView,
  recallView,
  rememberView,
} from './viewMemory'

const view = (anchor: number, head = anchor) => ({
  selection: [{ anchor, head }],
  main: 0,
  editor: { line: 3, at: 0.5 },
  length: 100,
})

describe('viewMemory', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('recalls a view fitted into the text as it is now', () => {
    rememberView('d-1', {
      ...view(10, 90),
      selection: [
        { anchor: 10, head: 90 },
        { anchor: 95, head: 95 },
      ],
      main: 1,
    })
    expect(recallView('d-1', 100)?.selection).toEqual([
      { anchor: 10, head: 90 },
      { anchor: 95, head: 95 },
    ])
    const shorter = recallView('d-1', 50)!
    expect(shorter.selection).toEqual([
      { anchor: 10, head: 50 },
      { anchor: 50, head: 50 },
    ])
    expect(shorter.main).toBe(1)
    expect(shorter.editor).toEqual({ line: 3, at: 0.5 })
    expect(recallView('d-2', 100)).toBeNull()
  })

  it('keeps the views of the documents looked at last', () => {
    vi.useFakeTimers()
    for (let i = 0; i <= VIEW_LIMIT; i++) {
      vi.setSystemTime(1_000 + i)
      rememberView(`d-${i}`, view(i))
    }
    expect(recallView('d-0', 1000)).toBeNull()
    expect(recallView('d-1', 1000)).not.toBeNull()
    expect(recallView(`d-${VIEW_LIMIT}`, 1000)).not.toBeNull()
  })

  it('follows a moved document and forgets deleted ones', () => {
    rememberView('d-old', view(5))
    rememberView('d-gone', view(7))
    moveView('d-old', 'd-new')
    expect(recallView('d-old', 100)).toBeNull()
    expect(recallView('d-new', 100)?.selection).toEqual([{ anchor: 5, head: 5 }])
    forgetViews((id) => id === 'd-new')
    expect(recallView('d-gone', 100)).toBeNull()
    expect(recallView('d-new', 100)).not.toBeNull()
  })

  it('ignores broken entries and is cleared on sign-out', () => {
    localStorage.setItem(
      'mkdocseditor.documentViews.',
      JSON.stringify({ 'd-bad': { selection: 'x' }, 'd-ok': { ...view(1), savedAt: 1 } }),
    )
    expect(recallView('d-bad', 100)).toBeNull()
    expect(recallView('d-ok', 100)).not.toBeNull()
    clearViews('')
    expect(recallView('d-ok', 100)).toBeNull()
  })
})
