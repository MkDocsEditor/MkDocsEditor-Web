import { describe, expect, it } from 'vitest'

import { findReferences, maskNonReferences } from './references'

const dests = (text: string) => findReferences(text).map((r) => `${r.kind}:${r.destination}`)

describe('findReferences', () => {
  it('finds links, images, definitions and HTML attributes', () => {
    const text = [
      'See [setup](guide/setup.md "Setup") and ![logo](img/logo.png).',
      '[ref]: ../other.md "Title"',
      '<img src="a.png"> <a href=\'b.md\'>b</a> <video src=c.mp4>',
      '[spaces](<my file.pdf>)',
    ].join('\n')
    expect(dests(text)).toEqual([
      'link:guide/setup.md',
      'image:img/logo.png',
      'definition:../other.md',
      'html:a.png',
      'html:b.md',
      'html:c.mp4',
      'link:my file.pdf',
    ])
  })

  it('records offsets and lines of the destination', () => {
    const text = 'x\n![a](<b c.png>)'
    const [ref] = findReferences(text)
    expect(ref).toMatchObject({ line: 2, destination: 'b c.png' })
    expect(text.slice(ref!.from, ref!.to)).toBe('b c.png')
  })

  it('finds destinations with raw spaces', () => {
    const text = '![a](./b c.png) [d](e f.md "Titel") [g](Foto (2) neu.png) [h](i.md (j))'
    expect(dests(text)).toEqual([
      'image:./b c.png',
      'link:e f.md',
      'link:Foto (2) neu.png',
      'link:i.md',
    ])
    const [ref] = findReferences(text)
    expect(text.slice(ref!.from, ref!.to)).toBe('./b c.png')
  })

  it('finds nested image links separately', () => {
    expect(dests('[![logo](img/logo.png)](index.md)')).toEqual([
      'image:img/logo.png',
      'link:index.md',
    ])
  })

  it('skips code, comments, front matter, external links and anchors', () => {
    const text = [
      '---',
      'image: [x](front.png)',
      '---',
      '```md',
      '![code](in-code.png)',
      '```',
      '    ~~~',
      '    [x](in-tilde.md)',
      '    ~~~',
      '`[inline](code.md)` <!-- [c](comment.md) -->',
      '[web](https://example.com) [mail](mailto:a@b.c) [top](#top) [^1]: note',
      '!!! note',
      '    [inside](admonition.md)',
    ].join('\n')
    expect(dests(text)).toEqual(['link:admonition.md'])
  })

  it('handles parentheses in destinations and link text', () => {
    expect(dests('[a (b)](Strand%20(2).png) [c](d.md#x?y)')).toEqual([
      'link:Strand%20(2).png',
      'link:d.md#x?y',
    ])
  })
})

describe('maskNonReferences', () => {
  it('keeps the length and the line breaks', () => {
    const text = '```\ncode\n```\n`x` y'
    const masked = maskNonReferences(text)
    expect(masked).toHaveLength(text.length)
    expect(masked.split('\n')).toHaveLength(4)
    expect(masked.trim()).toBe('y')
  })
})
