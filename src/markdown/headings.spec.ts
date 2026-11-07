import { describe, expect, it } from 'vitest'

import { headingsOf, sectionOf, slugify } from './headings'

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

describe('sectionOf', () => {
  const page =
    '# Titel\n\nText\n\n## Zutaten\n\n- Mehl\n\n### Optional\n\nZucker\n\n## Schritte\n\nRühren\n'

  it('takes the first name that is a heading, up to the next heading of its level', () => {
    expect(sectionOf(page, ['Fehlt', 'Zutaten', 'Schritte'])).toEqual({ from: 5, to: 11 })
    expect(sectionOf(page, ['Optional'])).toEqual({ from: 9, to: 11 })
    expect(sectionOf(page, ['Schritte'])).toEqual({ from: 13, to: 15 })
  })

  it('matches headings with inline markdown and takes the first of equal ones', () => {
    expect(sectionOf('## **Fett**  Text\n\n## Fett Text\n', ['Fett Text'])).toEqual({
      from: 1,
      to: 1,
    })
  })

  it('is undefined without a matching heading', () => {
    expect(sectionOf(page, [])).toBeUndefined()
    expect(sectionOf('```\n# Code\n```\n', ['Code'])).toBeUndefined()
  })
})
