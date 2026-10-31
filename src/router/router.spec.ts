import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import { ApiClient, setApiClient } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'

import { buildRouter } from './index'

function backend(whoamiStatus: number) {
  const mock = createFetchMock({
    'GET /auth/whoami/': () =>
      whoamiStatus === 200 ? json({ username: '' }) : new Response('', { status: whoamiStatus }),
  })
  setApiClient(
    new ApiClient({ baseUrl: 'http://backend', getCredentials: () => null, fetchFn: mock.fetchFn }),
  )
}

describe('router guard', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => setApiClient(null))

  it('sends logged-out users to the login page and keeps the target', async () => {
    backend(401)
    const router = buildRouter(createMemoryHistory())
    await router.push('/document/d1')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/document/d1')
  })

  it('lets users in when the backend needs no login', async () => {
    backend(200)
    const router = buildRouter(createMemoryHistory())
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('lets users with stored credentials in', async () => {
    backend(401)
    localStorage.setItem(
      'mkdocseditor.credentials',
      JSON.stringify({ username: 'a', password: 'b' }),
    )
    const router = buildRouter(createMemoryHistory())
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
  })
})
