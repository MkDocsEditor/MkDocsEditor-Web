import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFakeSession } from '@/test/fakeSession'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

const fakes: ReturnType<typeof createFakeSession>[] = []
vi.mock('@/sync', () => ({
  createDocumentSession: () => {
    const fake = createFakeSession('# Apfelkuchen\n\nLecker.')
    fakes.push(fake)
    return fake.session
  },
}))

const { default: DocumentView } = await import('./DocumentView.vue')

async function setup() {
  localStorage.setItem('mkdocseditor.documentMode', JSON.stringify('split'))
  const mock = createFetchMock({ 'GET /section/': () => json(sampleTree()) })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const result = await mountWithPlugins(DocumentView, { props: { id: 'd-apfel' } })
  await useTreeStore().load()
  await flushPromises()
  return result
}

describe('DocumentView', () => {
  afterEach(() => {
    setApiClient(null)
    localStorage.clear()
    fakes.length = 0
  })

  it('shows editor and preview of the session text and follows remote edits', async () => {
    const { wrapper } = await setup()
    expect(wrapper.find('[data-testid="document-title"]').text()).toBe('Apfelkuchen')
    expect(wrapper.find('.cm-content').text()).toContain('Lecker.')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="markdown-preview"] h1').text()).toBe('Apfelkuchen'),
    )

    fakes[0]!.remote([{ from: 22, to: 22, insert: ' Sehr!' }])
    await flushPromises()
    expect(wrapper.find('.cm-content').text()).toContain('Lecker. Sehr!')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="markdown-preview"]').text()).toContain('Sehr!'),
    )
    wrapper.unmount()
  })

  it('lists online users once per username and shows the connection state', async () => {
    const { wrapper } = await setup()
    const peer = { username: 'anna', displayName: 'Anna Muster', color: '#1971c2', selections: [] }
    ;(fakes[0]!.session.peers as { value: unknown }).value = [
      { ...peer, clientId: 'c1' },
      { ...peer, clientId: 'c2' },
    ]
    await flushPromises()
    expect(wrapper.findAll('[data-testid="online-users"] .v-avatar')).toHaveLength(1)
    expect(wrapper.find('[data-testid="online-users"]').text()).toBe('AM')
    expect(wrapper.find('[data-testid="connection-state"]').attributes('title')).toBe('Saved')
    wrapper.unmount()
  })

  it('closes the session when leaving', async () => {
    const { wrapper } = await setup()
    const close = vi.spyOn(fakes[0]!.session, 'close')
    wrapper.unmount()
    expect(close).toHaveBeenCalled()
  })
})
