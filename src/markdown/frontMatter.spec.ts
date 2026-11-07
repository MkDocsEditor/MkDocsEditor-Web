import { describe, expect, it } from 'vitest'

import { blankFrontMatter, parseFrontMatter } from './frontMatter'
import { renderPage } from './render'

const page = (yaml: string, body = '# Inhalt\n') => `---\n${yaml}\n---\n${body}`

describe('parseFrontMatter', () => {
  it('reads the fields of MkDocs and Material, and keeps the rest as extra', () => {
    const { meta, lines, error } = parseFrontMatter(
      page(
        [
          'title: Apfelkuchen',
          'description: Der von Oma',
          'icon: material/cake-variant',
          'status: new',
          'tags:',
          '  - Backen',
          '  - Kuchen',
          'hide:',
          '  - toc',
          '  - tags',
          'search:',
          '  exclude: true',
          'author: Anna',
        ].join('\n'),
      ),
    )
    expect(error).toBeUndefined()
    expect(lines).toBe(15)
    expect(meta).toMatchObject({
      title: 'Apfelkuchen',
      description: 'Der von Oma',
      icon: 'material/cake-variant',
      status: 'new',
      tags: ['Backen', 'Kuchen'],
      hide: ['toc', 'tags'],
      searchExclude: true,
    })
    expect(meta.extra.author).toBe('Anna')
  })

  it('only counts a block at the very start, closed by --- or ...', () => {
    expect(parseFrontMatter('# Titel\n---\ntitle: x\n---\n').lines).toBe(0)
    expect(parseFrontMatter('\n---\ntitle: x\n---\n').lines).toBe(0)
    expect(parseFrontMatter('---\ntitle: x\n...\nText').meta.title).toBe('x')
    expect(parseFrontMatter('---\n---\nText')).toMatchObject({ lines: 2, meta: { tags: [] } })
    // a page that is only front matter
    expect(parseFrontMatter('---\ntitle: x\n---').meta.title).toBe('x')
  })

  it('takes single values and numbers for lists and texts', () => {
    const { meta } = parseFrontMatter(page('title: 2026\ntags: Backen\nhide: toc'))
    expect(meta).toMatchObject({ title: '2026', tags: ['Backen'], hide: ['toc'] })
  })

  it('says what is wrong with broken YAML, and has no meta data then', () => {
    const broken = parseFrontMatter(page('title: [unclosed'))
    expect(broken.error).toMatch(/^The front matter is not valid YAML/)
    expect(broken.meta.title).toBeUndefined()
    expect(broken.lines).toBe(3)
    expect(parseFrontMatter(page('- just\n- a list')).error).toBe(
      'The front matter is not a list of keys.',
    )
  })

  it('keeps the lines of the block as empty lines', () => {
    const source = page('title: x')
    expect(blankFrontMatter(source, parseFrontMatter(source).lines)).toBe('\n\n\n# Inhalt\n')
  })
})

describe('renderPage', () => {
  it('never shows the front matter, and returns it as meta data', () => {
    const { html, meta } = renderPage(page('title: Kuchen\nauthor: Anna'))
    expect(html).not.toContain('author')
    expect(html).not.toContain('title:')
    expect(meta.title).toBe('Kuchen')
  })

  it('shows the title as the heading of a page without one, as Material does', () => {
    const without = renderPage(page('title: Kuchen', 'Nur Text.\n')).html
    expect(without).toContain('<h1 data-source-line="0">Kuchen</h1>')
    const own = renderPage(page('title: Kuchen', '# Eigene Überschrift\n')).html
    expect(own).not.toContain('>Kuchen<')
    expect(own).toContain('Eigene Überschrift')
  })

  it('shows tags unless hidden, and the status next to the title', () => {
    const { html } = renderPage(page('title: Kuchen\nstatus: new\ntags: [Backen, Süß]', 'Text'))
    expect(html).toContain('<nav class="md-tags" aria-label="Tags">')
    expect(html).toContain('<span class="md-tag">Süß</span>')
    expect(html).toContain('<span class="md-status md-status--new">New</span>')
    expect(renderPage(page('tags: [Backen]\nhide: [tags]')).html).not.toContain('md-tag')
    expect(renderPage(page('status: deprecated')).html).toContain(
      '<p class="md-status-line"><span class="md-status md-status--deprecated">Deprecated</span></p>',
    )
  })

  it('warns about broken front matter instead of showing it', () => {
    const { html, metaError } = renderPage(page('title: [unclosed'))
    expect(metaError).toMatch(/not valid YAML/)
    expect(html).toContain('class="md-meta-error"')
    expect(html).not.toContain('unclosed')
    expect(html).toContain('Inhalt')
  })

  it('escapes what the front matter says', () => {
    const { html } = renderPage(
      page('title: "<img src=x onerror=alert(1)>"\ntags: ["<b>x</b>"]', 'Text'),
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
  })

  it('keeps the source lines of the content', () => {
    const { html } = renderPage(page('title: x', 'Erster Absatz.\n'))
    expect(html).toContain('<p data-source-line="3">Erster Absatz.</p>')
  })
})
