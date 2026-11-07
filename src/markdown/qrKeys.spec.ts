import { describe, expect, it } from 'vitest'

import { normalizeQrKey, qrKeysOf, suggestQrKey, withQrKeys } from './qrKeys'

describe('QR code keys', () => {
  it('reads keys like the backend', () => {
    expect(qrKeysOf('---\nqr: Waschmaschine \n---\n')).toEqual([
      { key: 'waschmaschine', label: null },
    ])
    expect(
      qrKeysOf(
        '---\nqr:\n  - key: wm\n    label: "Keller"\n  - 42\n  - -bad\n  - WM\n  - [x]\n---\n',
      ),
    ).toEqual([
      { key: 'wm', label: 'Keller' },
      { key: '42', label: null },
    ])
    expect(qrKeysOf('# Kein Front Matter\n')).toEqual([])
    expect(normalizeQrKey('a'.repeat(65))).toBeUndefined()
  })

  it('suggests a key from the page name', () => {
    expect(suggestQrKey('Waschmaschine (Keller)')).toBe('waschmaschine-keller')
    expect(suggestQrKey('Größe & Füße')).toBe('groesse-fuesse')
    expect(suggestQrKey('Café')).toBe('cafe')
  })

  it('adds a front matter at the top', () => {
    expect(withQrKeys('# Waschmaschine\n', [{ key: 'wm', label: null }])).toBe(
      '---\nqr: wm\n---\n\n# Waschmaschine\n',
    )
    expect(withQrKeys('', [{ key: 'wm', label: null }])).toBe('---\nqr: wm\n---\n')
    expect(withQrKeys('Text', [])).toBe('Text')
  })

  it('adds the entry to a front matter without one', () => {
    expect(withQrKeys('---\ntitle: WM\n---\nText', [{ key: 'wm', label: null }])).toBe(
      '---\ntitle: WM\nqr: wm\n---\nText',
    )
  })

  it('replaces the entry, in every form, and keeps the rest', () => {
    const text = '---\ntitle: WM\nqr:\n  - key: alt\n    label: x\n- weiter\n\ntags: [a]\n---\nText'
    expect(
      withQrKeys(text, [
        { key: 'wm', label: 'Keller, an der "Maschine"' },
        { key: 'true', label: null },
      ]),
    ).toBe(
      '---\ntitle: WM\nqr:\n  - key: wm\n    label: "Keller, an der \\"Maschine\\""\n  - "true"\n\ntags: [a]\n---\nText',
    )
    expect(withQrKeys('---\nqr: [a, b]\ntags: [x]\n---\n', [{ key: '7', label: null }])).toBe(
      '---\nqr: "7"\ntags: [x]\n---\n',
    )
    expect(withQrKeys('---\nqr: a\ntags: [x]\n---\n', [])).toBe('---\ntags: [x]\n---\n')
  })

  it('writes what it reads back', () => {
    const keys = [
      { key: 'wm', label: 'Keller: links' },
      { key: 'no', label: null },
      { key: '0123', label: null },
    ]
    expect(qrKeysOf(withQrKeys('# Seite\n', keys))).toEqual(keys)
  })
})
