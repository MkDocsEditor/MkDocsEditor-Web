import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useLiveStore } from '@/stores/live'
import { useNotifyStore } from '@/stores/notify'
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
    expect(wrapper.text()).toContain('Not found')
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

  it('uploads chosen files into the folder', async () => {
    const { wrapper, requests } = await setup('s-urlaub', {
      'POST /resource/s-urlaub/Strand.jpg/': () =>
        json({ type: 'resource', id: 'r-strand', name: 'Strand.jpg', filesize: 3, modtime: '' }),
    })
    const input = wrapper.find('[data-testid="file-input"]').element as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [new File(['abc'], 'Strand.jpg', { type: 'image/jpeg' })],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() =>
      expect(requests.some((r) => r.method === 'POST' && r.url.includes('/resource/'))).toBe(true),
    )
    await flushPromises()
    expect(useNotifyStore().queue.map((n) => n.text)).toContain('Uploaded “Strand.jpg”')
    wrapper.unmount()
  })

  it('uploads dropped files', async () => {
    const { wrapper, requests } = await setup('s-urlaub', {
      'POST /resource/s-urlaub/Plan.pdf/': () =>
        json({ type: 'resource', id: 'r-plan', name: 'Plan.pdf', filesize: 3, modtime: '' }),
    })
    const root = wrapper.find('.section-view')
    const dataTransfer = { types: ['Files'], files: [new File(['abc'], 'Plan.pdf')] }
    await root.trigger('dragenter', { dataTransfer })
    expect(wrapper.find('[data-testid="drop-zone"]').exists()).toBe(true)
    await root.trigger('drop', { dataTransfer })
    expect(wrapper.find('[data-testid="drop-zone"]').exists()).toBe(false)
    await vi.waitFor(() =>
      expect(requests.some((r) => r.url.includes('/resource/s-urlaub/Plan.pdf'))).toBe(true),
    )
    wrapper.unmount()
  })

  it('shows who has a page open', async () => {
    const { wrapper } = await setup()
    useLiveStore().online = new Map([
      ['d-index', [{ username: 'anna', displayName: 'Anna Müller', color: '#1971c2' }]],
    ])
    await flushPromises()
    const avatars = wrapper.find('[data-testid="online-avatars"]')
    expect(avatars.text()).toBe('AM')
    expect(avatars.attributes('title')).toBe('Open now by Anna Müller')
    wrapper.unmount()
  })
})
