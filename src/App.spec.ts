import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient, useApi } from '@/api'
import { showFilesInTree } from '@/composables/preferences'
import { showInTree } from '@/composables/showInTree'
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
      // the menu opens with a transition, which a busy machine can make take a while
      await vi.waitFor(() =>
        expect(document.querySelector('[data-testid="menu-account"]')).not.toBeNull(),
      )
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
    // the login view loads lazily
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
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

  it('shows the open item in the tree: opens its folders, scrolls to it and focuses it', async () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    const { pinia } = signedIn()
    const { wrapper } = await mountWithPlugins(App, { initialPath: '/document/d-apfel', pinia })
    await flushPromises()
    const row = () =>
      document.querySelector<HTMLElement>('[data-testid="nav-drawer"] [data-item-id="d-apfel"]')
    // folded away by hand
    await wrapper.find('[data-item-id="s-rezepte"] button[aria-label="Collapse"]').trigger('click')
    expect(row()).toBeNull()

    window.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyL', key: 'L' }),
    )
    await flushPromises()
    expect(row()).not.toBeNull()
    expect(document.activeElement).toBe(row())
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' })
    wrapper.unmount()
  })

  it('shows the files in the tree to show a file there', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    showFilesInTree.value = false
    const { pinia } = signedIn()
    const { wrapper } = await mountWithPlugins(App, { initialPath: '/resource/r-apfel', pinia })
    await flushPromises()
    const row = () => document.querySelector<HTMLElement>('[data-item-id="r-apfel"]')
    expect(row()).toBeNull()
    showInTree('r-apfel')
    await flushPromises()
    expect(showFilesInTree.value).toBe(true)
    expect(document.activeElement).toBe(row())
    wrapper.unmount()
  })
})
