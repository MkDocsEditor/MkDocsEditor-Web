import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import ReauthDialog from '@/components/auth/ReauthDialog.vue'
import { encodeConnectPayload } from '@/services/connectLink'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import { authStatus, user } from '@/test/fixtures'
import { mountWithPlugins, stubRoutes } from '@/test/mount'

import ConnectView from './ConnectView.vue'
import WelcomeView from './WelcomeView.vue'

const routes = [
  ...stubRoutes().filter((r) => !['connect', 'welcome'].includes(String(r.name))),
  { path: '/connect', name: 'connect', component: ConnectView },
  { path: '/welcome', name: 'welcome', component: WelcomeView },
]

const payload = encodeConnectPayload({
  v: 1,
  backendUrl: 'https://backend.wiki.example.com',
  username: 'anna',
  token: 'mdd_secret',
  expiresAt: '2099-01-01T12:05:00Z',
})

describe('ConnectView', () => {
  afterEach(() => setApiClient(null))

  it('offers the app, the install steps and the link, without any request', async () => {
    const mock = createFetchMock({})
    setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
    const { wrapper, router } = await mountWithPlugins(ConnectView, {
      routes,
      initialPath: `/connect#${payload}`,
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-info"]').text()).toContain('anna')
    expect(wrapper.find('[data-testid="connect-info"]').text()).toContain(
      'backend.wiki.example.com',
    )
    expect(wrapper.find('[data-testid="connect-open-app"]').attributes('href')).toBe(
      `mkdocseditor://connect#${payload}`,
    )
    expect(wrapper.find('[data-testid="connect-install"]').text()).toContain('Obtainium')
    expect(wrapper.find('[data-testid="connect-install"]').text()).toContain('prereleases')
    expect(wrapper.find('[data-testid="connect-link"] input').element).toHaveProperty(
      'value',
      `${window.location.origin}/connect#${payload}`,
    )
    // the payload stays in the fragment and never goes to a server
    expect(router.currentRoute.value.hash).toBe(`#${payload}`)
    expect(mock.requests).toHaveLength(0)
    wrapper.unmount()
  })

  it('explains the page without a link, and expired links', async () => {
    const plain = await mountWithPlugins(ConnectView, { routes, initialPath: '/connect' })
    await flushPromises()
    expect(plain.wrapper.find('[data-testid="connect-invalid"]').text()).toContain(
      'Account → Devices',
    )
    expect(plain.wrapper.find('[data-testid="connect-open-app"]').exists()).toBe(false)
    plain.wrapper.unmount()

    const old = encodeConnectPayload({
      v: 1,
      backendUrl: 'https://b.example.com',
      username: 'anna',
      token: 'mdd_x',
      expiresAt: '2020-01-01T00:00:00Z',
    })
    const expired = await mountWithPlugins(ConnectView, { routes, initialPath: `/connect#${old}` })
    await flushPromises()
    expect(expired.wrapper.find('[data-testid="connect-info"]').text()).toContain('expired')
    expect(expired.wrapper.find('[data-testid="connect-open-app"]').exists()).toBe(false)
    expired.wrapper.unmount()
  })
})

describe('WelcomeView', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    setApiClient(null)
    vi.unstubAllGlobals()
  })

  it('opens a fresh connect link on this phone from the app hint', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, origin: window.location.origin })
    const mock = createFetchMock({
      'GET /auth/status/': () => json(authStatus()),
      'POST /account/device-links/': () =>
        json({
          deviceLink: {
            id: 'dl',
            status: 'pending',
            deviceName: null,
            createdAt: '',
            expiresAt: '',
          },
          token: 'mdd_z',
          expiresAt: '2099-01-01T00:00:00Z',
          connectUrl: 'https://edit.example.com/connect#p',
        }),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
    const Page = defineComponent({ render: () => [h(WelcomeView), h(ReauthDialog)] })
    const { wrapper, router } = await mountWithPlugins(Page, {
      routes,
      initialPath: '/welcome?app=1&redirect=/document/d1',
    })
    useAuthStore().signedIn(user())
    await flushPromises()
    expect(localStorage.getItem('mkdocseditor.androidHintShown')).toBe('1')
    await wrapper.find('[data-testid="android-hint-open"]').trigger('click')
    await flushPromises()
    expect(assign).toHaveBeenCalledWith('https://edit.example.com/connect#p')
    expect(router.currentRoute.value.name).toBe('welcome')
    wrapper.unmount()
  })

  it('goes on to the target once both steps are done', async () => {
    const { wrapper, router } = await mountWithPlugins(WelcomeView, {
      routes,
      initialPath: '/welcome?passkey=1&app=1&redirect=/document/d1',
    })
    useAuthStore().signedIn(user())
    await flushPromises()
    await wrapper.find('[data-testid="passkey-step-later"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('welcome')
    await wrapper.find('[data-testid="android-hint-dismiss"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/document/d1')
    wrapper.unmount()
  })
})
