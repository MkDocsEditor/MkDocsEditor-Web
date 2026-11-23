import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import type { SectionModel } from '@/api'
import { clearResourceUrls } from '@/services/resourceUrls'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import MarkdownPreview from './MarkdownPreview.vue'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

let failLogo = false

async function setup(text: string, tree: () => SectionModel = sampleTree) {
  clearResourceUrls()
  let downloads = 0
  const mock = createFetchMock({
    'GET /section/': () => json(tree()),
    'GET /resource/r-logo/content/': () =>
      failLogo ? new Response('', { status: 502 }) : new Response(`png ${++downloads}`),
    'GET /resource/r-diagram/content/': () => new Response(SVG),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  let urls = 0
  URL.createObjectURL = vi.fn(() => (++urls === 1 ? 'blob:logo' : `blob:logo-${urls}`))
  URL.revokeObjectURL = vi.fn()
  const result = await mountWithPlugins(MarkdownPreview, {
    props: { text, sectionId: 's-kuchen' },
  })
  await useTreeStore().load()
  await flushPromises()
  return { ...result, ...mock }
}

/** The pointer moves onto an element (jsdom has no PointerEvent). */
async function pointAt(element: Element): Promise<void> {
  element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  await nextTick()
}

describe('MarkdownPreview', () => {
  it('loads relative images from resources with auth', async () => {
    const { wrapper } = await setup('![Logo](../../logo.png)')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe('blob:logo'))
    wrapper.unmount()
  })

  it('shows the new content of an image that was replaced', async () => {
    let modtime = '2026-11-01T10:00:00Z'
    const tree = () => {
      const root = sampleTree()
      root.resources[0]!.modtime = modtime
      return root
    }
    const { wrapper } = await setup('![Logo](../../logo.png)', tree)
    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe('blob:logo'))

    // the previous test's URLs, revoked by setup
    vi.mocked(URL.revokeObjectURL).mockClear()

    // the same tree again: nothing to download
    await useTreeStore().load()
    await flushPromises()
    expect(wrapper.find('img').attributes('src')).toBe('blob:logo')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    // an upload replaced the file; the events socket makes the tree load again
    modtime = '2026-11-01T10:05:00Z'
    await useTreeStore().load()
    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe('blob:logo-2'))
    // something may still show or download the old version
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('asks again for an image that failed to load when the tree loads again', async () => {
    failLogo = true
    const { wrapper } = await setup('![Logo](../../logo.png)')
    await vi.waitFor(() => expect(wrapper.find('img').classes()).toContain('preview-image-missing'))

    failLogo = false
    await useTreeStore().load()
    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe('blob:logo'))
    expect(wrapper.find('img').classes()).not.toContain('preview-image-missing')
    wrapper.unmount()
  })

  it('offers to copy an SVG image as SVG while the pointer is on it', async () => {
    const tree = () => {
      const root = sampleTree()
      root.resources.push({
        type: 'resource',
        id: 'r-diagram',
        name: 'diagram.svg',
        filesize: 41,
        modtime: '',
      })
      return root
    }
    const { wrapper } = await setup('![Plan](../../diagram.svg)\n\n![Logo](../../logo.png)', tree)
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await flushPromises()
    const [plan, logo] = wrapper.findAll('img')

    await pointAt(logo!.element)
    expect(wrapper.find('[data-testid="copy-svg"]').exists()).toBe(false)

    await pointAt(plan!.element)
    await wrapper.find('[data-testid="copy-svg"]').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(SVG))

    await wrapper.find('.markdown-preview-frame').trigger('mouseleave')
    expect(wrapper.find('[data-testid="copy-svg"]').exists()).toBe(false)
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
