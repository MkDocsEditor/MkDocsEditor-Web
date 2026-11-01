import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import ResourceView from './ResourceView.vue'

async function setup(id: string) {
  const tree = sampleTree()
  tree.resources.push({
    type: 'resource',
    id: 'r-text',
    name: 'notes.txt',
    filesize: 5,
    modtime: '',
  })
  const mock = createFetchMock({
    'GET /section/': () => json(tree),
    'GET /resource/r-text/content/': () => new Response('Hallo Welt'),
    'GET /resource/r-apfel/content/': () => new Response('png'),
    'DELETE /resource/r-text/': () => new Response(null, { status: 204 }),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  URL.createObjectURL = vi.fn(() => 'blob:apfel')
  const result = await mountWithPlugins(ResourceView, { props: { id } })
  await useTreeStore().load()
  await flushPromises()
  return { ...result, ...mock }
}

describe('ResourceView', () => {
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('shows a text file with its path', async () => {
    const { wrapper } = await setup('r-text')
    expect(wrapper.find('[data-testid="resource-title"]').text()).toBe('notes.txt')
    expect(wrapper.find('[data-testid="resource-path"]').text()).toContain('notes.txt')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="resource-preview"]').text()).toBe('Hallo Welt'),
    )
    wrapper.unmount()
  })

  it('shows an image', async () => {
    const { wrapper } = await setup('r-apfel')
    expect(wrapper.find('[data-testid="resource-path"]').text()).toContain(
      'Rezepte/Kuchen/apfel.png',
    )
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="resource-preview"] img').attributes('src')).toBe(
        'blob:apfel',
      ),
    )
    wrapper.unmount()
  })

  it('deletes and goes back to the folder', async () => {
    const { wrapper, router, requests } = await setup('r-text')
    await wrapper.find('[data-testid="resource-delete"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-testid="confirm-button"]') as HTMLElement).click()
    await flushPromises()
    expect(requests.some((r) => r.method === 'DELETE')).toBe(true)
    expect(useNotifyStore().queue.at(-1)?.text).toBe('Deleted “notes.txt”')
    expect(router.currentRoute.value.name).toBe('home')
    wrapper.unmount()
  })

  it('says when the file does not exist', async () => {
    const { wrapper } = await setup('r-gone')
    expect(wrapper.text()).toContain('This file does not exist')
    wrapper.unmount()
  })
})
