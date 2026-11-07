import { mdiFileDocumentOutline, mdiFolderOutline } from '@mdi/js'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DocumentModel, SectionModel } from '@/api'

import { usePageMetaStore } from './pageMeta'
import { usePagesStore } from './pages'

const page = (id: string, name: string): DocumentModel => ({
  type: 'document',
  id,
  name,
  filesize: 0,
  modtime: '',
  url: '',
})

describe('page meta store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function store(texts: Record<string, string>) {
    usePagesStore().pages = new Map(
      Object.entries(texts).map(([id, text]) => [id, { text, modtime: '' }]),
    )
    return usePageMetaStore()
  }

  it('reads the front matter of the stored pages', () => {
    const meta = store({
      a: '---\ntitle: Apfelkuchen\ndescription: Mit Streuseln\nstatus: new\ntags: [Backen]\n---\n# A',
      b: 'No front matter',
    })
    expect(meta.meta('a')).toMatchObject({
      title: 'Apfelkuchen',
      description: 'Mit Streuseln',
      status: 'new',
      tags: ['Backen'],
    })
    expect(meta.meta('b').title).toBeUndefined()
    expect(meta.meta('unknown').tags).toEqual([])
  })

  it('shows the title of a page, else its name; folders keep their name', () => {
    const meta = store({ a: '---\ntitle: Apfelkuchen\n---\n', b: '# B' })
    expect(meta.title(page('a', 'apfel'))).toBe('Apfelkuchen')
    expect(meta.title(page('b', 'birne'))).toBe('birne')
    expect(meta.title({ type: 'section', id: 'a', name: 'Ordner' })).toBe('Ordner')
  })

  it('follows changed texts', () => {
    const meta = store({ a: '---\ntitle: Alt\n---\n' })
    expect(meta.title(page('a', 'a'))).toBe('Alt')
    usePagesStore().pages = new Map([['a', { text: '---\ntitle: Neu\n---\n', modtime: '' }]])
    expect(meta.title(page('a', 'a'))).toBe('Neu')
  })

  it('falls back to the icon of the type', () => {
    const meta = store({ a: '---\nicon: fontawesome/brands/github\n---\n' })
    expect(meta.icon(page('a', 'a'))).toBe(mdiFileDocumentOutline)
    const folder = { type: 'section', id: 's', name: 's' } as unknown as SectionModel
    expect(meta.icon(folder)).toBe(mdiFolderOutline)
  })
})
