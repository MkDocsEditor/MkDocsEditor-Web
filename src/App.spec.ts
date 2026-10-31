import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import App from './App.vue'

describe('App', () => {
  afterEach(() => {
    setApiClient(null)
    localStorage.clear()
  })

  it('renders only the app bar when logged out', async () => {
    const { wrapper } = await mountWithPlugins(App, { initialPath: '/login' })
    expect(wrapper.text()).toContain('MkDocsEditor')
    expect(wrapper.find('[data-testid="search-button"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads the tree and shows the navigation when logged in', async () => {
    localStorage.setItem(
      'mkdocseditor.credentials',
      JSON.stringify({ username: 'a', password: 'b' }),
    )
    const mock = createFetchMock({ 'GET /section/': () => json(sampleTree()) })
    setApiClient(
      new ApiClient({ baseUrl: 'http://b', getCredentials: () => null, fetchFn: mock.fetchFn }),
    )
    const { wrapper } = await mountWithPlugins(App, { initialPath: '/document/d-apfel' })
    expect(useAuthStore().isLoggedIn).toBe(true)
    await flushPromises()
    expect(wrapper.find('[data-testid="search-button"]').exists()).toBe(true)
    // the drawer opens the path to the current document
    const drawer = wrapper.find('[data-testid="nav-drawer"]')
    expect(drawer.text()).toContain('Rezepte')
    expect(drawer.text()).toContain('Kuchen')
    expect(drawer.text()).toContain('Apfelkuchen')
    wrapper.unmount()
  })
})
