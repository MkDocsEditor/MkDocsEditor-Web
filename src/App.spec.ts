import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient, useApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree, user } from '@/test/fixtures'
import { mountWithPlugins, stubRoutes } from '@/test/mount'

import App from './App.vue'

function signedIn(overrides: Parameters<typeof user>[0] = {}, routes = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const mock = createFetchMock({ 'GET /section/': () => json(sampleTree()), ...routes })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  useAuthStore().signedIn(user(overrides))
  return { pinia, mock }
}

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
    const { pinia } = signedIn()
    const { wrapper } = await mountWithPlugins(App, { initialPath: '/document/d-apfel', pinia })
    await flushPromises()
    expect(wrapper.find('[data-testid="search-button"]').exists()).toBe(true)
    // the drawer opens the path to the current document
    const drawer = wrapper.find('[data-testid="nav-drawer"]')
    expect(drawer.text()).toContain('Rezepte')
    expect(drawer.text()).toContain('Kuchen')
    expect(drawer.text()).toContain('Apfelkuchen')
    wrapper.unmount()
  })

  it('offers the admin pages only to admins', async () => {
    for (const role of ['admin', 'editor'] as const) {
      const { pinia } = signedIn({ role })
      const { wrapper } = await mountWithPlugins(App, { initialPath: '/', pinia })
      await flushPromises()
      await wrapper.find('[data-testid="account-menu"]').trigger('click')
      await flushPromises()
      expect(document.querySelector('[data-testid="menu-account"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="menu-admin"]') !== null).toBe(role === 'admin')
      wrapper.unmount()
    }
  })

  it('goes to the login and keeps the place when the session ends', async () => {
    const { pinia } = signedIn()
    const { wrapper, router } = await mountWithPlugins(App, {
      initialPath: '/document/d-apfel',
      pinia,
    })
    await flushPromises()
    // any request that finds the session gone
    useApi().onSessionEnded?.()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/document/d-apfel')
    expect(useAuthStore().sessionEnded).toBe(true)
    wrapper.unmount()
  })

  it('signs out on the server', async () => {
    const { pinia, mock } = signedIn(
      {},
      { 'POST /auth/logout/': () => new Response(null, { status: 204 }) },
    )
    const { wrapper, router } = await mountWithPlugins(App, { initialPath: '/', pinia })
    await flushPromises()
    await wrapper.find('[data-testid="account-menu"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-testid="menu-logout"]') as HTMLElement).click()
    await flushPromises()
    expect(mock.requests.some((r) => r.method === 'POST' && r.url.endsWith('/auth/logout/'))).toBe(
      true,
    )
    expect(useAuthStore().isLoggedIn).toBe(false)
    expect(useAuthStore().sessionEnded).toBe(false)
    expect(router.currentRoute.value.name).toBe('login')
    wrapper.unmount()
  })

  it('shows no wiki while a second factor must be set up', async () => {
    const { pinia, mock } = signedIn({ secondFactorSetupRequired: true })
    const routes = [
      ...stubRoutes().filter((r) => r.name !== 'account'),
      {
        path: '/account/:tab?',
        name: 'account',
        component: { render: () => 'Account page' },
        meta: { standalone: true },
      },
    ]
    const { wrapper } = await mountWithPlugins(App, {
      initialPath: '/account/security',
      pinia,
      routes,
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-drawer"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Account page')
    expect(mock.requests.some((r) => r.url.endsWith('/section/'))).toBe(false)
    wrapper.unmount()
  })
})
