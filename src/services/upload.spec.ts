import { describe, expect, it } from 'vitest'

import { sampleTree } from '@/test/fixtures'

import { markdownFor, sanitizeFileName, shrinkImage, uniqueName } from './upload'

describe('upload helpers', () => {
  it('makes file names safe', () => {
    expect(sanitizeFileName('a/b\\c:d?.jpg')).toBe('a-b-c-d-.jpg')
    expect(sanitizeFileName('  Foto   vom  Strand.jpg ')).toBe('Foto vom Strand.jpg')
    expect(sanitizeFileName('.versteckt')).toBe('versteckt')
    expect(sanitizeFileName('...')).toBe('file')
  })

  it('finds a free name in the folder', () => {
    const root = sampleTree()
    expect(uniqueName(root, 'neu.png')).toBe('neu.png')
    expect(uniqueName(root, 'Logo.PNG')).toBe('Logo (2).PNG')
    root.resources.push({ ...root.resources[0]!, id: 'r2', name: 'logo (2).png' })
    expect(uniqueName(root, 'logo.png')).toBe('logo (3).png')
    expect(
      uniqueName({ ...root, resources: [{ ...root.resources[0]!, name: 'README' }] }, 'README'),
    ).toBe('README (2)')
  })

  it('writes markdown for images and other files', () => {
    expect(markdownFor('Foto (2).jpg', true)).toBe('![Foto (2)](Foto%20%282%29.jpg)')
    expect(markdownFor('Einkaufsliste.pdf', false)).toBe('[Einkaufsliste.pdf](Einkaufsliste.pdf)')
    expect(markdownFor('Grüße [alt].png', true)).toBe('![Grüße alt](Grüße%20%5Balt%5D.png)')
    expect(markdownFor('logo.png', true, '../img/logo.png')).toBe('![logo](../img/logo.png)')
  })

  it('keeps files it does not shrink', async () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    expect(await shrinkImage(png)).toBe(png)
  })
})
