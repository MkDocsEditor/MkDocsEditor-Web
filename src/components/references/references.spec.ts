import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import type { Backlink, ItemRef } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'
import ReferencesView from '@/views/ReferencesView.vue'

import BacklinksList from './BacklinksList.vue'
import { breakWarning, groupBySource, linesLabel } from './backlinks'

const doc = (id: string, path: string): ItemRef => ({ type: 'document', id, path, name: id })
const logo: ItemRef = { type: 'resource', id: 'r-logo', path: 'logo.png', name: 'logo.png' }

function link(source: ItemRef, line: number, internal = false): Backlink {
  return {
    source,
    kind: 'image',
    line,
    column: 1,
    destination: 'logo.png',
    anchor: '',
    target: logo,
    internal,
  }
}

const a = doc('d-a', 'a.md')
const b = doc('d-b', 'x/b.md')

describe('backlink helpers', () => {
  it('groups by page and names the lines', () => {
    const groups = groupBySource([link(a, 3), link(a, 9), link(b, 1)])
    expect(groups.map((g) => [g.source.id, linesLabel(g.links)])).toEqual([
      ['d-a', 'lines 3, 9'],
      ['d-b', 'line 1'],
    ])
  })

  it('warns about links a delete would break', () => {
    expect(breakWarning(null, 'file')).toBe('')
    expect(breakWarning([], 'file')).toBe('')
    expect(breakWarning([link(a, 3)], 'file')).toBe(
      '1 page links to this file; that link will break.',
    )
    expect(breakWarning([link(a, 3), link(a, 4), link(b, 1)], 'page')).toBe(
      '2 pages link to this page; those links will break.',
    )
  })
})

describe('BacklinksList', () => {
  afterEach(() => setApiClient(null))

  it('lists the pages that link to an item, opening them at the line', async () => {
    const mock = createFetchMock({
      'GET /section/s-kuchen/backlinks/': () =>
        json({ item: logo, backlinks: [link(a, 3), link(a, 9), link(b, 2, true)] }),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const { wrapper } = await mountWithPlugins(BacklinksList, {
      props: { type: 'section', id: 's-kuchen', externalOnly: true },
    })
    await flushPromises()
    const items = wrapper.findAll('[data-testid="backlink"]')
    expect(items).toHaveLength(1)
    expect(items[0]!.text()).toContain('a.md · lines 3, 9')
    expect(items[0]!.attributes('href')).toBe('/document/d-a?line=3')
  })

  it('says when there are none, or when the backend cannot tell', async () => {
    const mock = createFetchMock({
      'GET /document/d-a/backlinks/': () => json({ item: a, backlinks: [] }),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const empty = await mountWithPlugins(BacklinksList, { props: { type: 'document', id: 'd-a' } })
    await flushPromises()
    expect(empty.wrapper.find('[data-testid="backlinks-empty"]').exists()).toBe(true)
    const old = await mountWithPlugins(BacklinksList, { props: { type: 'document', id: 'd-x' } })
    await flushPromises()
    expect(old.wrapper.text()).toContain('This server does not track links yet.')
  })
})

describe('ReferencesView', () => {
  afterEach(() => setApiClient(null))

  it('lists broken links with fixes and unused files', async () => {
    const mock = createFetchMock({
      'GET /section/': () => json(sampleTree()),
      'GET /references/broken/': () =>
        json({
          broken: [
            {
              source: a,
              kind: 'link',
              line: 4,
              column: 2,
              destination: 'alt.md',
              anchor: '',
              status: 'broken',
              target: null,
              reason: 'not-found',
              path: 'alt.md',
              movedTo: doc('d-neu', 'neu/alt.md'),
              suggestedDestination: 'neu/alt.md',
            },
            {
              source: a,
              kind: 'image',
              line: 8,
              column: 1,
              destination: 'weg.png',
              anchor: '',
              status: 'broken',
              target: null,
              reason: 'not-found',
              path: 'weg.png',
            },
          ],
        }),
      'GET /references/unused-resources/': () =>
        json({
          resources: [
            { type: 'resource', id: 'r-logo', name: 'logo.png', filesize: 10, modtime: '' },
          ],
        }),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const { wrapper } = await mountWithPlugins(ReferencesView, { props: {} })
    await useTreeStore().load()
    await flushPromises()
    const broken = wrapper.findAll('[data-testid="broken-link"]')
    expect(broken.map((b) => b.text())).toEqual([
      expect.stringContaining('Line 4 · moved to neu/alt.md, use neu/alt.md'),
      expect.stringContaining('Line 8 · weg.png does not exist'),
    ])
    expect(broken[1]!.attributes('href')).toBe('/document/d-a?line=8')
    await wrapper.find('[data-testid="tab-unused"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="unused-file"]').text()).toContain('logo.png · 10 B')
  })
})
