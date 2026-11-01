import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import type { TreeItem } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import TreeBrowser from './TreeBrowser.vue'

async function setup(extra: Record<string, unknown> = {}) {
  const mock = createFetchMock({ 'GET /section/': () => json(sampleTree()) })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const props = reactive<Record<string, unknown>>({ section: 's-kuchen', ...extra })
  props['onUpdate:section'] = (id: string) => (props.section = id)
  const { wrapper } = await mountWithPlugins(TreeBrowser, { props })
  await useTreeStore().load()
  await flushPromises()
  const picked = () =>
    (wrapper.findComponent(TreeBrowser).emitted('pick') ?? []).map((e) => (e[0] as TreeItem).id)
  return { wrapper, props, picked }
}

const names = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], testid: string) =>
  wrapper.findAll(`[data-testid="${testid}"]`).map((e) => e.find('.v-list-item-title').text())

describe('TreeBrowser', () => {
  afterEach(() => setApiClient(null))

  it('lists a folder, opens folders and picks other items', async () => {
    const { wrapper, props, picked } = await setup()
    expect(wrapper.find('[data-testid="browser-current"]').text()).toBe('Kuchen')
    expect(names(wrapper, 'browser-resource')).toEqual(['apfel.png', 'Plan (alt).pdf'])
    await wrapper.find('[data-testid="browser-up"]').trigger('click')
    expect(props.section).toBe('s-rezepte')
    await flushPromises()
    await wrapper.find('[data-testid="browser-document"]').trigger('click')
    expect(picked()).toEqual(['d-suppe'])
  })

  it('filters types, disables items and searches', async () => {
    const { wrapper, picked } = await setup({
      types: ['resource'],
      filter: (item: TreeItem) => item.name.endsWith('.png'),
      disabledIds: ['r-apfel'],
    })
    expect(wrapper.findAll('[data-testid="browser-document"]')).toHaveLength(0)
    const apfel = wrapper.find('[data-testid="browser-resource"]')
    expect(apfel.classes()).toContain('v-list-item--disabled')
    await apfel.trigger('click')
    expect(picked()).toEqual([])
    await wrapper.find('[data-testid="browser-search"] input').setValue('logo')
    await wrapper.find('[data-testid="browser-hit-resource"]').trigger('click')
    expect(picked()).toEqual(['r-logo'])
  })

  it('picks folders from the search and the current folder when allowed', async () => {
    const { wrapper, picked } = await setup({ pickSections: true })
    await wrapper.find('[data-testid="browser-pick-current"]').trigger('click')
    await wrapper.find('[data-testid="browser-search"] input').setValue('Urlaub')
    await wrapper.find('[data-testid="browser-hit-section"]').trigger('click')
    expect(picked()).toEqual(['s-kuchen', 's-urlaub'])
  })
})
