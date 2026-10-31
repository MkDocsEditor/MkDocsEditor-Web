import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { basicAuthHeader } from '@/api/client'
import { createFetchMock, json } from '@/test/fetchMock'

import { useAuthStore } from './auth'

async function withClient(routes: Parameters<typeof createFetchMock>[0]) {
  const mock = createFetchMock(routes)
  const store = useAuthStore()
  setApiClient(
    new ApiClient({
      baseUrl: 'http://backend',
      getCredentials: () => store.credentials,
      fetchFn: mock.fetchFn,
    }),
  )
  return { store, ...mock }
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('logs in, remembers the credentials and logs out', async () => {
    const { store, requests } = await withClient({
      'GET /auth/whoami/': () => json({ username: 'anna' }),
    })
    expect(store.isLoggedIn).toBe(false)
    await store.login(' anna ', 'pw', true)
    expect(store.isLoggedIn).toBe(true)
    expect(store.username).toBe('anna')
    expect(requests[0]?.headers.get('Authorization')).toBe(
      basicAuthHeader({ username: 'anna', password: 'pw' }),
    )
    expect(JSON.parse(localStorage.getItem('mkdocseditor.credentials') ?? '')).toEqual({
      username: 'anna',
      password: 'pw',
    })

    store.logout()
    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('mkdocseditor.credentials')).toBeNull()
  })

  it('keeps credentials only for the session without "remember me"', async () => {
    const { store } = await withClient({ 'GET /auth/whoami/': () => json({ username: 'ben' }) })
    await store.login('ben', 'pw', false)
    expect(localStorage.getItem('mkdocseditor.credentials')).toBeNull()
    expect(sessionStorage.getItem('mkdocseditor.credentials')).not.toBeNull()
  })

  it('does not store anything when the login fails', async () => {
    const { store } = await withClient({
      'GET /auth/whoami/': () => new Response('', { status: 401 }),
    })
    await expect(store.login('anna', 'wrong', true)).rejects.toMatchObject({ status: 401 })
    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('restores stored credentials', () => {
    localStorage.setItem(
      'mkdocseditor.credentials',
      JSON.stringify({ username: 'anna', password: 'pw' }),
    )
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(true)
    expect(store.username).toBe('anna')
  })

  it('detects a backend without auth', async () => {
    const { store } = await withClient({ 'GET /auth/whoami/': () => json({ username: '' }) })
    await store.ensureChecked()
    expect(store.anonymous).toBe(true)
    expect(store.isLoggedIn).toBe(true)
  })

  it('stays logged out when the backend needs auth', async () => {
    const { store } = await withClient({
      'GET /auth/whoami/': () => new Response('', { status: 401 }),
    })
    await store.ensureChecked()
    expect(store.isLoggedIn).toBe(false)
  })
})
