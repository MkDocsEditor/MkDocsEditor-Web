import { describe, expect, it } from 'vitest'

import { formatSize, iconFor, isImage } from './icons'
import { stripMarkdownExtension, validateName } from './names'
import { wikiPageUrl } from './wiki'

describe('validateName', () => {
  it('accepts normal names, including umlauts and spaces', () => {
    expect(validateName('Kürbis Suppe')).toBe(true)
  })
  it.each(['', '  ', '.', '..', '.hidden', 'a/b', 'a\\b', 'a:b', 'a?b'])('rejects %j', (name) => {
    expect(validateName(name)).not.toBe(true)
  })
})

describe('stripMarkdownExtension', () => {
  it('removes a trailing .md', () => {
    expect(stripMarkdownExtension(' Seite.MD ')).toBe('Seite')
    expect(stripMarkdownExtension('md-Tipps')).toBe('md-Tipps')
  })
})

describe('icons and sizes', () => {
  it('detects images by extension', () => {
    expect(isImage('Foto.JPG')).toBe(true)
    expect(isImage('notes.txt')).toBe(false)
    expect(isImage('png')).toBe(false)
  })
  it('picks different icons per type', () => {
    const doc = iconFor({ type: 'document', id: '', name: '', filesize: 0, modtime: '', url: '' })
    const img = iconFor({ type: 'resource', id: '', name: 'a.png', filesize: 0, modtime: '' })
    expect(doc).not.toBe(img)
  })
  it('formats sizes in German', () => {
    expect(formatSize(500)).toBe('500 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1,5 MB')
  })
})

describe('wikiPageUrl', () => {
  it('joins the site URL and the page path', () => {
    expect(wikiPageUrl('Rezepte/Kuchen/', 'https://wiki.example.com/')).toBe(
      'https://wiki.example.com/Rezepte/Kuchen/',
    )
    expect(wikiPageUrl('/index/', 'https://wiki.example.com')).toBe(
      'https://wiki.example.com/index/',
    )
  })
  it('returns null without a configured site', () => {
    expect(wikiPageUrl('x/', '')).toBeNull()
  })
})
