import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import type { FeedEntry } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import DashboardView from './DashboardView.vue'

const anna = { accountId: 'anna', displayName: 'Anna', color: '#123456', avatar: null }
const ben = { accountId: 'ben', displayName: 'Ben', color: '#654321', avatar: null }

function edit(id: string, minute: number, path: string, more: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id,
    time: `2026-11-27T10:${String(minute).padStart(2, '0')}:00Z`,
    kind: 'edited',
    itemType: 'document',
    documentId: 'd-apfel',
    path,
    authors: [anna],
    summary: { linesAdded: 1, linesRemoved: 0, headings: [] },
    ...more,
  }
}

async function setup(entries: FeedEntry[]) {
  const mock = createFetchMock({
    'GET /section/': () => json(sampleTree()),
    'GET /pins': () => json({ personal: [], family: [] }),
    'GET /pins/': () => json({ personal: [], family: [] }),
    'GET /feed/': () => json({ entries, next: null }),
    'GET /feed': () => json({ entries, next: null }),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const result = await mountWithPlugins(DashboardView)
  await useTreeStore().load()
  await flushPromises()
  return result
}

describe('DashboardView feed', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('folds the edits of a page into one row that opens to them', async () => {
    const apfel = 'Rezepte/Kuchen/Apfelkuchen.md'
    const { wrapper } = await setup([
      edit('e3', 50, apfel, {
        authors: [ben],
        summary: { linesAdded: 2, linesRemoved: 0, headings: ['Backen'] },
      }),
      edit('other', 40, 'Rezepte/Kürbissuppe.md', { documentId: 'd-suppe' }),
      edit('e2', 30, apfel, { summary: { linesAdded: 1, linesRemoved: 1, headings: ['Zutaten'] } }),
      edit('e1', 10, apfel),
    ])
    const group = wrapper.get('[data-testid="feed-group"]')
    expect(group.text()).toContain('Anna and Ben edited')
    expect(group.get('[data-testid="feed-group-count"]').text()).toBe('3 edits')
    expect(group.get('[data-testid="feed-headings"]').text()).toBe('In Backen, Zutaten')
    // at its newest edit, before the other page; that one alone, as before
    const rows = wrapper.findAll('[data-testid="feed-group"], [data-testid="feed-entry"]')
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual(['feed-group', 'feed-entry'])
    // it opens the page where the newest edit is
    expect(group.attributes('href')).toBe('/document/d-apfel?section=Backen')

    const toggle = wrapper.get('[data-testid="feed-group-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    // its edits, each with its own counts
    const nested = wrapper.findAll('.feed-entry--nested')
    expect(nested).toHaveLength(3)
    expect(nested[1]!.get('[data-testid="feed-removed"]').text()).toBe('−1')
    expect(wrapper.vm.$route.name).not.toBe('document')

    await toggle.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.feed-entry--nested')).toHaveLength(0)
    wrapper.unmount()
  })
})
