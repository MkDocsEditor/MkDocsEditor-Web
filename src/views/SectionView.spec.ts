import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import SectionView from './SectionView.vue'

async function setup(id?: string, extraRoutes: Parameters<typeof createFetchMock>[0] = {}) {
  const mock = createFetchMock({ 'GET /section/': () => json(sampleTree()), ...extraRoutes })
  setApiClient(
    new ApiClient({ baseUrl: 'http://b', getCredentials: () => null, fetchFn: mock.fetchFn }),
  )
  const result = await mountWithPlugins(SectionView, { props: id ? { id } : {} })
  await useTreeStore().load()
  await flushPromises()
  return { ...result, ...mock }
}

describe('SectionView', () => {
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('lists folders, pages and files of the root, folders first', async () => {
    const { wrapper } = await setup()
    expect(wrapper.find('[data-testid="section-title"]').text()).toBe('Wiki')
    const titles = wrapper.findAll('.v-list-item-title').map((t) => t.text())
    expect(titles).toEqual(['Rezepte', 'Urlaub', 'index', 'logo.png'])
    wrapper.unmount()
  })

  it('shows a sub section with breadcrumbs', async () => {
    const { wrapper } = await setup('s-kuchen')
    expect(wrapper.find('[data-testid="section-title"]').text()).toBe('Kuchen')
    expect(wrapper.find('.v-breadcrumbs').text()).toContain('Rezepte')
    expect(wrapper.findAll('[data-testid="entry-document"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows "not found" for unknown sections', async () => {
    const { wrapper } = await setup('nope')
    expect(wrapper.text()).toContain('Nicht gefunden')
    wrapper.unmount()
  })

  it('creates a page and opens it', async () => {
    const { wrapper, router, requests } = await setup('s-urlaub', {
      'POST /document/': () =>
        json({ type: 'document', id: 'd-new', name: 'Italien', filesize: 0, modtime: '', url: '' }),
    })
    await wrapper.find('[data-testid="create-fab"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-testid="create-document"]') as HTMLElement).click()
    await flushPromises()
    const input = document.querySelector('[data-testid="name-input"] input') as HTMLInputElement
    input.value = 'Italien.md'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(document.querySelector('[data-testid="name-confirm"]') as HTMLElement).click()
    await flushPromises()
    const post = requests.find((r) => r.method === 'POST')
    expect(JSON.parse(post?.body as string)).toEqual({ parent: 's-urlaub', name: 'Italien' })
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/document/d-new'))
    wrapper.unmount()
  })
})
