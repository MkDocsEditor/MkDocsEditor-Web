import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import { rememberSearch } from '@/services/recentSearches'
import { usePagesStore } from '@/stores/pages'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import SearchDialog from './SearchDialog.vue'

const q = (selector: string) => document.querySelector<HTMLElement>(selector)
const qa = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]

async function setup() {
  const mock = createFetchMock({ 'GET /section/': () => json(sampleTree()) })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const open = ref(false)
  const Host = defineComponent({
    setup: () => () =>
      h(SearchDialog, {
        modelValue: open.value,
        'onUpdate:modelValue': (value: boolean) => (open.value = value),
      }),
  })
  const result = await mountWithPlugins(Host)
  await useTreeStore().load()
  open.value = true
  await flushPromises()
  return { ...result, open }
}

async function type(text: string): Promise<void> {
  const input = q('[data-testid="search-input"] input') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 320))
  await flushPromises()
}

describe('SearchDialog', () => {
  afterEach(() => {
    setApiClient(null)
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('offers recent searches, searches for a chosen one, and shows them again when cleared', async () => {
    setActivePinia(createPinia())
    rememberSearch('Kuchen')
    rememberSearch('Rezepte')
    const { wrapper } = await setup()
    expect(qa('[data-testid="search-recent-term"]').map((e) => e.textContent?.trim())).toEqual([
      'Rezepte',
      'Kuchen',
    ])

    qa('[data-testid="search-recent-term"]')[1]!.click()
    await vi.waitFor(() => expect(qa('[data-testid="search-result"]').length).toBeGreaterThan(0))
    expect(q('[data-testid="search-recent"]')).toBeNull()
    expect((q('[data-testid="search-input"] input') as HTMLInputElement).value).toBe('Kuchen')

    await type('')
    expect(qa('[data-testid="search-recent-term"]').map((e) => e.textContent?.trim())).toEqual([
      'Kuchen',
      'Rezepte',
    ])
    wrapper.unmount()
  })

  it('says when the term is too short instead of showing no results', async () => {
    const { wrapper } = await setup()
    await type('k')
    expect(q('[data-testid="search-too-short"]')?.textContent).toContain('at least 2 characters')
    expect(document.body.textContent).not.toContain('Nothing found')
    await type('xyzzy')
    expect(q('[data-testid="search-too-short"]')).toBeNull()
    expect(document.body.textContent).toContain('Nothing found')
    wrapper.unmount()
  })

  it('shows matches and excerpts of pages, with the term marked', async () => {
    const { wrapper } = await setup()
    usePagesStore().edited('d-index', '# Start\n\nEin Kürbis und noch ein Kürbis')
    await type('kürbis')
    const row = qa('[data-testid="search-result"]').find((e) => e.textContent?.includes('index'))!
    expect(row.querySelector('[data-testid="search-match-count"]')?.textContent).toContain(
      '2 matches',
    )
    expect(row.textContent).toContain('Top level')
    const excerpt = row.querySelector('[data-testid="search-excerpt"]')!
    expect(excerpt.textContent).toContain('Start')
    expect([...excerpt.querySelectorAll('mark')].map((m) => m.textContent)).toEqual([
      'Kürbis',
      'Kürbis',
    ])
    wrapper.unmount()
  })

  it('shows counts of folders and the size of files', async () => {
    const { wrapper } = await setup()
    await type('rezepte')
    const folder = qa('[data-testid="search-result"]')[0]!
    expect(folder.textContent).toMatch(/\d+ (page|folder)/)
    await type('logo')
    expect(qa('[data-testid="search-result"]')[0]!.textContent).toMatch(/\d+ (B|KB|MB)/)
    wrapper.unmount()
  })

  it('says that pages are still being fetched', async () => {
    const { wrapper } = await setup()
    usePagesStore().progress = { done: 3, total: 10 }
    await type('kuchen')
    expect(q('[data-testid="search-progress"]')?.textContent).toContain('3 of 10')
    wrapper.unmount()
  })
})
