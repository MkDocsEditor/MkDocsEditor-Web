import { describe, expect, it } from 'vitest'

import { headingsOf, slugify } from './headings'

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['Äpfel & Birnen', 'apfel-birnen'],
    ['  Step 2: install  ', 'step-2-install'],
    ['C++ / Rust', 'c-rust'],
    ['日本語', ''],
  ])('%s', (text, slug) => {
    expect(slugify(text)).toBe(slug)
  })
})

describe('headingsOf', () => {
  it('finds headings with unique anchors and skips code', () => {
    const text = [
      '---',
      '# not: a heading',
      '---',
      '# Title',
      '',
      '## Use `code` and **bold** ##',
      '```',
      '# comment in code',
      '```',
      '## Title',
      '### Custom { #my-id }',
      '#hashtag',
    ].join('\n')
    expect(headingsOf(text)).toEqual([
      { level: 1, text: 'Title', id: 'title', line: 4 },
      { level: 2, text: 'Use code and bold', id: 'use-code-and-bold', line: 6 },
      { level: 2, text: 'Title', id: 'title_1', line: 10 },
      { level: 3, text: 'Custom', id: 'my-id', line: 11 },
    ])
  })
})
