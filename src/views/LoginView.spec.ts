import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import { mountWithPlugins } from '@/test/mount'

import LoginView from './LoginView.vue'

const routes = [
  { path: '/login', component: LoginView },
  { path: '/:pathMatch(.*)*', component: { render: () => null } },
]

function backend(status: number) {
  const mock = createFetchMock({
    'GET /auth/whoami/': () =>
      status === 200 ? json({ username: 'anna' }) : new Response('', { status }),
  })
  setApiClient(
    new ApiClient({ baseUrl: 'http://backend', getCredentials: () => null, fetchFn: mock.fetchFn }),
  )
  return mock
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof mountWithPlugins>>['wrapper']) {
  await wrapper.find('input[name="username"]').setValue('anna')
  await wrapper.find('input[name="password"]').setValue('pw')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('LoginView', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => setApiClient(null))

  it('logs in and follows the redirect', async () => {
    backend(200)
    const { wrapper, router } = await mountWithPlugins(LoginView, {
      routes,
      initialPath: '/login?redirect=/document/d1',
    })
    await fillAndSubmit(wrapper)
    expect(useAuthStore().isLoggedIn).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/document/d1')
    wrapper.unmount()
  })

  it('shows a friendly message for wrong credentials', async () => {
    backend(401)
    const { wrapper, router } = await mountWithPlugins(LoginView, {
      routes,
      initialPath: '/login',
    })
    await fillAndSubmit(wrapper)
    expect(wrapper.find('[data-testid="login-error"]').text()).toContain('stimmt nicht')
    expect(router.currentRoute.value.path).toBe('/login')
    wrapper.unmount()
  })
})
