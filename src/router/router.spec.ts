import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import { ApiClient, setApiClient } from '@/api'
import type { AuthStatus, UserInfo } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { authStatus, user } from '@/test/fixtures'

import { buildRouter } from './index'

function backend(who: UserInfo | null, status: AuthStatus = authStatus()) {
  const mock = createFetchMock({
    'GET /auth/status/': () => json(status),
    'GET /auth/whoami/': () =>
      who ? json(who) : json({ code: 'unauthenticated', message: 'no session' }, 401),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
}

describe('router guard', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => setApiClient(null))

  it('sends logged-out users to the login page and keeps the target', async () => {
    backend(null)
    const router = buildRouter(createMemoryHistory())
    await router.push('/document/d1')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/document/d1')
  })

  it('lets users with a session in', async () => {
    backend(user({ role: 'editor' }))
    const router = buildRouter(createMemoryHistory())
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('lets users in when the backend needs no login', async () => {
    backend(null, authStatus({ authDisabled: true }))
    const router = buildRouter(createMemoryHistory())
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('opens the setup page while the instance has no account', async () => {
    backend(null, authStatus({ setupRequired: true }))
    const router = buildRouter(createMemoryHistory())
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('setup')
  })

  it('keeps the link pages public and the token in the fragment', async () => {
    backend(null)
    const router = buildRouter(createMemoryHistory())
    await router.push('/invite#mdl_abc')
    expect(router.currentRoute.value.name).toBe('invite')
    expect(router.currentRoute.value.hash).toBe('#mdl_abc')
  })

  it('keeps non-admins out of the admin pages', async () => {
    backend(user({ role: 'editor' }))
    const router = buildRouter(createMemoryHistory())
    await router.push('/admin/users')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('lets admins into the admin pages', async () => {
    backend(user({ role: 'admin' }))
    const router = buildRouter(createMemoryHistory())
    await router.push('/admin/invites')
    expect(router.currentRoute.value.name).toBe('admin')
    expect(router.currentRoute.value.params.tab).toBe('invites')
  })

  it('sends restricted sessions to the 2FA setup', async () => {
    backend(user({ secondFactorSetupRequired: true }))
    const router = buildRouter(createMemoryHistory())
    await router.push('/document/d1')
    expect(router.currentRoute.value.fullPath).toBe('/account/security')
  })
})
