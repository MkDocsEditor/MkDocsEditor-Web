import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import MarkdownPreview from './MarkdownPreview.vue'

async function setup(text: string) {
  const mock = createFetchMock({
    'GET /section/': () => json(sampleTree()),
    'GET /resource/r-logo/content/': () => new Response('png', { status: 200 }),
  })
  setApiClient(
    new ApiClient({ baseUrl: 'http://b', getCredentials: () => null, fetchFn: mock.fetchFn }),
  )
  URL.createObjectURL = vi.fn(() => 'blob:logo')
  const result = await mountWithPlugins(MarkdownPreview, {
    props: { text, sectionId: 's-kuchen' },
  })
  await useTreeStore().load()
  await flushPromises()
  return { ...result, ...mock }
}

describe('MarkdownPreview', () => {
  afterEach(() => setApiClient(null))

  it('loads relative images from resources with auth', async () => {
    const { wrapper } = await setup('![Logo](../../logo.png)')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe('blob:logo'))
    wrapper.unmount()
  })

  it('navigates to linked pages inside the app', async () => {
    const { wrapper, router } = await setup('[Suppe](../Kürbissuppe.md)')
    await wrapper.find('a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/document/d-suppe')
    wrapper.unmount()
  })

  it('opens external links in a new tab', async () => {
    const { wrapper } = await setup('[Web](https://example.com)')
    const link = wrapper.find('a')
    await link.trigger('click')
    expect(link.attributes('target')).toBe('_blank')
    wrapper.unmount()
  })
})
