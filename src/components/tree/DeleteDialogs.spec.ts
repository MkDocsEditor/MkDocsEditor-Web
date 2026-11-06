import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useItemActionsStore } from '@/stores/itemActions'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import DeleteDialogs from './DeleteDialogs.vue'

const buttons = () => [...document.querySelectorAll<HTMLElement>('[data-testid="confirm-button"]')]
const dialogText = () => document.querySelector('.v-overlay--active .v-card')?.textContent ?? ''

async function setup(path: string, deleteStatus = 204) {
  const deletes: string[] = []
  const mock = createFetchMock({
    'GET /section/': () => json(sampleTree()),
    'GET /section/s-kuchen/backlinks/': () => json({ backlinks: [] }),
    'GET /document/d-apfel/backlinks/': () => json({ backlinks: [] }),
    'DELETE /section/s-kuchen/': (r) => {
      deletes.push(r.url)
      return new Response(null, { status: 204 })
    },
    'DELETE /document/d-apfel/': (r) => {
      deletes.push(r.url)
      return deletes.length <= 2 && deleteStatus === 409
        ? json({ error: 'in use' }, 409)
        : new Response(null, { status: 204 })
    },
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const mounted = await mountWithPlugins(DeleteDialogs, { initialPath: path })
  await useTreeStore().load()
  return { ...mounted, deletes, actions: useItemActionsStore() }
}

async function confirmLast(): Promise<void> {
  await vi.waitFor(() => expect(buttons().length).toBeGreaterThan(0))
  buttons().at(-1)!.click()
  await flushPromises()
}

describe('DeleteDialogs', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('deletes a folder and leaves a page inside it for the parent folder', async () => {
    const { actions, deletes, router, wrapper } = await setup('/document/d-apfel')
    actions.remove(useTreeStore().get('s-kuchen')!)
    await flushPromises()
    expect(dialogText()).toContain('Delete folder?')
    expect(dialogText()).toContain('is deleted with everything in it')
    await confirmLast()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/section/s-rezepte'))
    await vi.waitFor(() => expect(deletes).toEqual(['http://b/section/s-kuchen/']))
    expect(useNotifyStore().queue.at(-1)?.text).toBe('Deleted “Kuchen”')
    wrapper.unmount()
  })

  it('stays where it is when the open page is somewhere else', async () => {
    const { actions, router, wrapper } = await setup('/section/s-urlaub')
    actions.remove(useTreeStore().get('s-kuchen')!)
    await confirmLast()
    expect(router.currentRoute.value.fullPath).toBe('/section/s-urlaub')
    wrapper.unmount()
  })

  it('offers to delete a page anyway that someone has open', async () => {
    const { actions, deletes, router, wrapper } = await setup('/document/d-apfel', 409)
    actions.remove(useTreeStore().get('d-apfel')!)
    await confirmLast()
    await vi.waitFor(() => expect(dialogText()).toContain('Being edited right now'), {
      timeout: 2000,
    })
    await confirmLast()
    // the first try again in case the own editor had not closed yet
    expect(deletes).toEqual([
      'http://b/document/d-apfel/',
      'http://b/document/d-apfel/',
      'http://b/document/d-apfel/?force=true',
    ])
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/section/s-kuchen'))
    wrapper.unmount()
  })
})
