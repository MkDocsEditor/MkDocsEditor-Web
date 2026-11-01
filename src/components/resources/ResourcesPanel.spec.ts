import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import ResourcesPanel from './ResourcesPanel.vue'

async function setup(text: string, props = reactive({ text, documentId: 'd-apfel' })) {
  const mock = createFetchMock({
    'GET /section/': () => json(sampleTree()),
    'GET /resource/r-apfel/content/': () => new Response('png'),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  URL.createObjectURL = vi.fn(() => 'blob:x')
  const result = await mountWithPlugins(ResourcesPanel, {
    props,
  })
  await useTreeStore().load()
  await flushPromises()
  return { ...result, props }
}

describe('ResourcesPanel', () => {
  afterEach(() => setApiClient(null))

  it('lists used files, missing ones and the rest of the folder', async () => {
    const { wrapper } = await setup(
      '![a](apfel.png)\n\n![again](./apfel.png)\n\n[weg](fehlt.pdf) [page](../Kürbissuppe.md)',
    )
    const used = wrapper.findAll('[data-testid="panel-used"]')
    expect(used.map((u) => u.text())).toEqual([expect.stringContaining('apfel.png')])
    expect(used[0]!.text()).toContain('2 times, first in line 1')
    expect(wrapper.findAll('[data-testid="panel-broken"]').map((b) => b.text())).toEqual([
      expect.stringContaining('fehlt.pdf'),
    ])
    expect(wrapper.findAll('[data-testid="panel-folder"]').map((f) => f.text())).toEqual([
      expect.stringContaining('Plan (alt).pdf'),
    ])
    wrapper.unmount()
  })

  it('emits insert, reveal and upload', async () => {
    const { wrapper } = await setup('![a](apfel.png)')
    const panel = wrapper.findComponent(ResourcesPanel)
    await wrapper.find('[data-testid="panel-folder"]').trigger('click')
    expect(panel.emitted('insert')?.[0]?.[0]).toMatchObject({ id: 'r-plan' })
    await wrapper.find('[data-testid="panel-used"]').trigger('click')
    expect(panel.emitted('reveal')?.[0]?.[0]).toMatchObject({ destination: 'apfel.png', line: 1 })

    const input = wrapper.find('[data-testid="panel-file-input"]')
    const file = new File(['x'], 'neu.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(panel.emitted('upload')?.[0]?.[0]).toEqual([file])
    wrapper.unmount()
  })

  it('updates while typing', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, props } = await setup('')
      props.text = '![p](Plan%20%28alt%29.pdf)'
      await nextTick()
      vi.advanceTimersByTime(400)
      await flushPromises()
      expect(wrapper.findAll('[data-testid="panel-used"]')).toHaveLength(1)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
