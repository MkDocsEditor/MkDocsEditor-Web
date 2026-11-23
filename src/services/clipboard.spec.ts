import { afterEach, describe, expect, it, vi } from 'vitest'

import { copySvg } from './clipboard'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

/** A ClipboardItem like the browser's, which keeps what it was given. */
function stubClipboardItem(supported: string[]) {
  class FakeClipboardItem {
    static supports = (type: string) => supported.includes(type)
    constructor(readonly items: Record<string, Promise<Blob>>) {}
  }
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
}

function stubClipboard(clipboard: Partial<Clipboard>) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

async function written(write: ReturnType<typeof vi.fn>): Promise<Record<string, string>> {
  const [item] = (write.mock.calls[0] as unknown[])[0] as { items: Record<string, Promise<Blob>> }[]
  const entries = await Promise.all(
    Object.entries(item!.items).map(async ([type, blob]) => [type, await (await blob).text()]),
  )
  return Object.fromEntries(entries)
}

describe('copySvg', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('copies the SVG as image/svg+xml and as text where the browser supports it', async () => {
    stubClipboardItem(['text/plain', 'image/svg+xml'])
    const write = vi.fn(() => Promise.resolve())
    stubClipboard({ write })
    expect(await copySvg(Promise.resolve(SVG))).toBe(true)
    expect(await written(write)).toEqual({ 'text/plain': SVG, 'image/svg+xml': SVG })
  })

  it('copies the source text alone where image/svg+xml is not supported', async () => {
    stubClipboardItem(['text/plain', 'image/png'])
    const write = vi.fn(() => Promise.resolve())
    stubClipboard({ write })
    expect(await copySvg(Promise.resolve(SVG))).toBe(true)
    expect(await written(write)).toEqual({ 'text/plain': SVG })
  })

  it('falls back to plain text, and never to a PNG', async () => {
    stubClipboardItem(['text/plain'])
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard({ write: vi.fn(() => Promise.reject(new Error('no promises'))), writeText })
    expect(await copySvg(Promise.resolve(SVG))).toBe(true)
    expect(writeText).toHaveBeenCalledWith(SVG)
  })

  it('reports a failed download', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    stubClipboard({ writeText: vi.fn(() => Promise.resolve()) })
    expect(await copySvg(Promise.reject(new Error('offline')))).toBe(false)
  })
})
