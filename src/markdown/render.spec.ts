import { describe, expect, it } from 'vitest'

import { renderMarkdown, stripFrontMatter } from './render'

function dom(markdown: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = renderMarkdown(markdown)
  return div
}

describe('renderMarkdown', () => {
  it('renders admonitions with title and nested markdown', () => {
    const el = dom('!!! warning "Achtung"\n    Heiß, **nicht** anfassen.\n\nDanach.')
    const box = el.querySelector('div.admonition.warning')
    expect(box).not.toBeNull()
    expect(box?.querySelector('.admonition-title')?.textContent).toBe('Achtung')
    expect(box?.querySelector('strong')?.textContent).toBe('nicht')
    expect(el.querySelector(':scope > p')?.textContent).toBe('Danach.')
  })

  it('uses the type as title when none is given and supports collapsible blocks', () => {
    const el = dom('!!! note\n    Text\n\n??? tip "Mehr"\n    versteckt\n\n???+ info\n    offen')
    expect(el.querySelector('.admonition.note .admonition-title')?.textContent).toBe('Note')
    const details = el.querySelectorAll('details.admonition')
    expect(details).toHaveLength(2)
    expect(details[0]?.querySelector('summary')?.textContent).toBe('Mehr')
    expect(details[0]?.hasAttribute('open')).toBe(false)
    expect(details[1]?.hasAttribute('open')).toBe(true)
  })

  it('keeps blank lines inside an admonition body', () => {
    const el = dom('!!! note\n    eins\n\n    zwei\n\naußen')
    expect(el.querySelectorAll('.admonition p:not(.admonition-title)')).toHaveLength(2)
    expect(el.querySelector(':scope > p')?.textContent).toBe('außen')
  })

  it('renders task lists, tables, footnotes and marks', () => {
    const el = dom(
      '- [x] Mehl\n- [ ] Äpfel\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nText[^1] ==wichtig==\n\n[^1]: Fußnote',
    )
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect([...boxes].map((b) => b.checked)).toEqual([true, false])
    expect(el.querySelector('table td')?.textContent).toBe('1')
    expect(el.querySelector('.footnotes')?.textContent).toContain('Fußnote')
    expect(el.querySelector('mark')?.textContent).toBe('wichtig')
  })

  it('highlights known languages and escapes unknown ones', () => {
    const el = dom('```python\nprint("hi")\n```\n\n```nope\n<b>x</b>\n```')
    expect(el.querySelector('code.language-python .hljs-built_in')).not.toBeNull()
    expect(el.querySelectorAll('pre code')[1]?.textContent).toBe('<b>x</b>\n')
    expect(el.querySelector('pre b')).toBeNull()
  })

  it.each([
    ['kotlin', 'val x = 1', '.hljs-keyword'],
    ['kt', 'fun main() {}', '.hljs-keyword'],
    ['go', 'func main() {}', '.hljs-keyword'],
    ['yaml', 'port: 8080', '.hljs-attr'],
    ['json', '{"a": true}', '.hljs-literal'],
    ['diff', '+added', '.hljs-addition'],
    ['dockerfile', 'FROM nginx', '.hljs-keyword'],
  ])('highlights %s', (language, code, selector) => {
    const el = dom(`\`\`\`${language}\n${code}\n\`\`\``)
    expect(el.querySelector(`pre.hljs ${selector}`)).not.toBeNull()
  })

  it('removes scripts and event handlers from raw HTML', () => {
    const el = dom('<img src="x.png" onerror="alert(1)">\n\n<script>alert(1)</script>')
    expect(el.querySelector('script')).toBeNull()
    expect(el.querySelector('img')?.getAttribute('onerror')).toBeNull()
  })

  it('marks blocks with their source line', () => {
    const el = dom('# Titel\n\nAbsatz')
    expect(el.querySelector('h1')?.dataset.sourceLine).toBe('0')
    expect(el.querySelector('p')?.dataset.sourceLine).toBe('2')
  })
})

describe('stripFrontMatter', () => {
  it('removes YAML front matter', () => {
    expect(stripFrontMatter('---\ntitle: x\n---\n# Hi')).toBe('\n\n\n# Hi')
    expect(stripFrontMatter('# Hi\n---\n')).toBe('# Hi\n---\n')
  })
})
