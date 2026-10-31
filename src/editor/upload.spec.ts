import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fileUpload, insertionFor } from './upload'

describe('insertionFor', () => {
  const doc = Text.of(['Hallo Welt', '', 'Ende'])

  it('puts uploads on lines of their own', () => {
    expect(insertionFor(doc, 5, ['![a](a.png)'])).toBe('\n![a](a.png)\n')
    expect(insertionFor(doc, 10, ['![a](a.png)'])).toBe('\n![a](a.png)')
    expect(insertionFor(doc, 11, ['![a](a.png)', '[b](b.pdf)'])).toBe('![a](a.png)\n[b](b.pdf)')
    expect(insertionFor(doc, 0, ['x'])).toBe('x\n')
    expect(insertionFor(doc, doc.length, ['x'])).toBe('\nx')
  })
})

describe('fileUpload', () => {
  let view: EditorView | null = null
  afterEach(() => {
    view?.destroy()
    view = null
  })

  function paste(files: File[]): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files, getData: () => '' } })
    view!.contentDOM.dispatchEvent(event)
    return event
  }

  function setup(upload: (files: File[]) => Promise<string[]>, editable = true) {
    view = new EditorView({
      state: EditorState.create({
        doc: 'Erste Zeile\nZweite Zeile',
        extensions: [fileUpload(upload), EditorView.editable.of(editable)],
      }),
      parent: document.body,
    })
    return view
  }

  it('uploads pasted files and inserts their markdown where they were pasted', async () => {
    let finish!: (value: string[]) => void
    const upload = vi.fn(() => new Promise<string[]>((resolve) => (finish = resolve)))
    const v = setup(upload)
    v.dispatch({ selection: { anchor: 11 } })
    const file = new File(['x'], 'image.png', { type: 'image/png' })
    expect(paste([file]).defaultPrevented).toBe(true)
    expect(upload).toHaveBeenCalledWith([file])
    // somebody types above the insert position during the upload
    v.dispatch({ changes: { from: 0, insert: '# Titel\n' } })
    finish(['![image](image.png)'])
    await vi.waitFor(() =>
      expect(v.state.doc.toString()).toBe(
        '# Titel\nErste Zeile\n![image](image.png)\nZweite Zeile',
      ),
    )
  })

  it('leaves pasted text to the editor', () => {
    const upload = vi.fn(async () => [])
    setup(upload)
    paste([])
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not upload into a read-only editor', () => {
    const upload = vi.fn(async () => [])
    setup(upload, false)
    paste([new File(['x'], 'a.png')])
    expect(upload).not.toHaveBeenCalled()
  })

  it('inserts nothing when the upload fails', async () => {
    const upload = vi.fn(async () => Promise.reject(new Error('kaputt')))
    const v = setup(upload)
    paste([new File(['x'], 'a.png')])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(v.state.doc.toString()).toBe('Erste Zeile\nZweite Zeile')
  })
})
