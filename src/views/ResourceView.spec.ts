import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import { showInTreeRequest } from '@/composables/showInTree'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import DeleteDialogs from '@/components/tree/DeleteDialogs.vue'

import ResourceView from './ResourceView.vue'

/** The page with the delete dialog of the app shell. */
const WithDialogs = defineComponent({
  props: { id: { type: String, required: true } },
  setup: (props) => () => [h(ResourceView, { id: props.id }), h(DeleteDialogs)],
})

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

async function setup(id: string) {
  const tree = sampleTree()
  tree.resources.push({
    type: 'resource',
    id: 'r-text',
    name: 'notes.txt',
    filesize: 5,
    modtime: '',
  })
  tree.resources.push({
    type: 'resource',
    id: 'r-diagram',
    name: 'diagram.svg',
    filesize: 41,
    modtime: '',
  })
  const mock = createFetchMock({
    'GET /section/': () => json(tree),
    'GET /resource/r-text/content/': () => new Response('Hallo Welt'),
    'GET /resource/r-apfel/content/': () => new Response('png'),
    'GET /resource/r-diagram/content/': () => new Response(SVG),
    'DELETE /resource/r-text/': () => new Response(null, { status: 204 }),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  URL.createObjectURL = vi.fn(() => 'blob:apfel')
  const result = await mountWithPlugins(WithDialogs, {
    props: { id },
    initialPath: `/resource/${id}`,
  })
  await useTreeStore().load()
  await flushPromises()
  return { ...result, ...mock }
}

describe('ResourceView', () => {
  afterEach(() => {
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
    // a picture copies fine with the browser's own "Copy image"
    expect(wrapper.find('[data-testid="copy-svg"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('copies an SVG as SVG, not as a picture', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { wrapper } = await setup('r-diagram')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="copy-svg"]').exists()).toBe(true))
    await wrapper.find('[data-testid="copy-svg"]').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(SVG))
    expect(useNotifyStore().queue.at(-1)?.text).toBe('SVG copied')
    wrapper.unmount()
  })

  it('shows the file in the tree', async () => {
    const { wrapper } = await setup('r-text')
    await wrapper.find('[data-testid="show-in-tree"]').trigger('click')
    expect(showInTreeRequest.value).toEqual({ id: 'r-text' })
    wrapper.unmount()
  })

  it('deletes and goes back to the folder', async () => {
    const { wrapper, router, requests } = await setup('r-text')
    await wrapper.find('[data-testid="resource-delete"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-testid="confirm-button"]') as HTMLElement).click()
    await vi.waitFor(() => expect(requests.some((r) => r.method === 'DELETE')).toBe(true))
    await flushPromises()
    expect(useNotifyStore().queue.at(-1)?.text).toBe('Deleted “notes.txt”')
    expect(router.currentRoute.value.name).toBe('files')
    wrapper.unmount()
  })

  it('says when the file does not exist', async () => {
    const { wrapper } = await setup('r-gone')
    expect(wrapper.text()).toContain('This file does not exist')
    wrapper.unmount()
  })
})
