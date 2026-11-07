import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import {
  lineNumbers,
  showFilesInTree,
  startPage,
  syncScroll,
  themeChoice,
} from '@/composables/preferences'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import { account, authStatus, user } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import SettingsView from './SettingsView.vue'

async function mount(section: string | undefined, role: 'admin' | 'reader' = 'admin') {
  const mock = createFetchMock({
    'GET /auth/status/': () => json(authStatus()),
    'GET /account/': () => json(account({ role })),
    'GET /server-info/': () =>
      json({ name: 'Wiki', version: '1.2.3', protocolVersion: 6, backendUrl: null }),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  const auth = () => useAuthStore()
  const result = await mountWithPlugins(SettingsView, {
    props: { section },
    initialPath: section ? `/settings/${section}` : '/settings',
  })
  auth().signedIn(user({ role }))
  await flushPromises()
  return result
}

const el = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

function choose(group: string, label: string): void {
  const radio = [...el(group)!.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
    (input) => input.closest('.v-radio')?.textContent?.includes(label),
  )
  radio!.click()
}

/** A window 1024 px wide: Vuetify asks `matchMedia` for its breakpoints. */
function wideWindow(): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)/.exec(query)
    return {
      matches: min ? 1024 >= Number(min[1]) : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    wideWindow()
    localStorage.clear()
    startPage.value = 'dashboard'
    themeChoice.value = 'system'
    showFilesInTree.value = true
    syncScroll.value = true
    lineNumbers.value = true
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('shows the list first on a narrow screen, then one section with a way back', async () => {
    vi.unstubAllGlobals()
    const list = await mount(undefined)
    expect(el('settings-nav')).not.toBeNull()
    expect(el('settings-back')).toBeNull()
    list.wrapper.unmount()
    const section = await mount('editor')
    expect(el('settings-nav')).toBeNull()
    expect(el('settings-title')!.textContent).toContain('Editor')
    expect(el('settings-back')).not.toBeNull()
    section.wrapper.unmount()
  })

  it('groups the sections, with the administration only for admins', async () => {
    const admin = await mount('appearance')
    const nav = el('settings-nav')!.textContent
    for (const title of ['Account', 'Profile', 'Sign-in and security', 'Sessions', 'This browser'])
      expect(nav).toContain(title)
    expect(nav).toContain('Administration')
    expect(el('settings-nav-users')).not.toBeNull()
    expect(el('settings-nav-appearance')?.classList).toContain('v-list-item--active')
    admin.wrapper.unmount()

    const reader = await mount('appearance', 'reader')
    expect(el('settings-nav')!.textContent).not.toContain('Administration')
    expect(el('settings-nav-users')).toBeNull()
    reader.wrapper.unmount()
  })

  it('opens the profile when no section is chosen', async () => {
    const { router, wrapper } = await mount(undefined)
    await flushPromises()
    expect(router.currentRoute.value.params.section).toBe('profile')
    wrapper.unmount()
  })

  it('keeps the settings of this browser', async () => {
    const { wrapper } = await mount('appearance')
    choose('setting-start-page', 'Files of the top folder')
    choose('setting-theme', 'Dark')
    el('setting-tree-files')!.querySelector('input')!.click()
    await flushPromises()
    expect(startPage.value).toBe('files')
    expect(themeChoice.value).toBe('dark')
    expect(showFilesInTree.value).toBe(false)
    expect(localStorage.getItem('mkdocseditor.startPage')).toBe('"files"')
    expect(localStorage.getItem('mkdocseditor.theme')).toBe('"dark"')
    wrapper.unmount()
  })

  it('keeps the editor settings of this browser', async () => {
    const { wrapper } = await mount('editor')
    el('setting-sync-scroll')!.querySelector('input')!.click()
    el('setting-line-numbers')!.querySelector('input')!.click()
    await flushPromises()
    expect(syncScroll.value).toBe(false)
    expect(lineNumbers.value).toBe(false)
    expect(localStorage.getItem('mkdocseditor.syncScroll')).toBe('false')
    wrapper.unmount()
  })

  it('shows the versions of the app and the server', async () => {
    const { wrapper } = await mount('about')
    expect(el('about-version')!.textContent).toContain('dev')
    expect(el('about-server-version')!.textContent).toContain('1.2.3 (protocol 6)')
    wrapper.unmount()
  })

  it('locks everything but the security until a second factor is set up', async () => {
    const { wrapper } = await mount('security')
    useAuthStore().setUser(user({ secondFactorSetupRequired: true }))
    await flushPromises()
    expect(el('settings-nav-profile')?.classList).toContain('v-list-item--disabled')
    expect(el('settings-nav-security')?.classList).not.toContain('v-list-item--disabled')
    wrapper.unmount()
  })
})
