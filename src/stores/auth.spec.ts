import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient, useApi } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { authStatus, user } from '@/test/fixtures'

import { useAuthStore } from './auth'

function withClient(routes: Parameters<typeof createFetchMock>[0]) {
  const mock = createFetchMock(routes)
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  return { store: useAuthStore(), ...mock }
}

const unauthenticated = () => json({ code: 'unauthenticated', message: 'no session' }, 401)

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('removes passwords stored by older versions', () => {
    localStorage.setItem('mkdocseditor.credentials', '{"username":"a","password":"b"}')
    sessionStorage.setItem('mkdocseditor.credentials', '{"username":"a","password":"b"}')
    useAuthStore()
    expect(localStorage.getItem('mkdocseditor.credentials')).toBeNull()
    expect(sessionStorage.getItem('mkdocseditor.credentials')).toBeNull()
  })

  it('checks the session with whoami and keeps only the profile, never a token', async () => {
    const { store, requests } = withClient({
      'GET /auth/status/': () => json(authStatus()),
      'GET /auth/whoami/': () => json(user()),
    })
    await store.ensureChecked()
    expect(store.isLoggedIn).toBe(true)
    expect(store.username).toBe('anna')
    expect(store.isAdmin).toBe(true)
    expect(requests.every((r) => r.credentials === 'include')).toBe(true)
    const stored = localStorage.getItem('mkdocseditor.user') ?? ''
    expect(JSON.parse(stored)).toMatchObject({ username: 'anna', role: 'admin' })
    expect(stored).not.toMatch(/mds_|password|token/)
  })

  it('stays logged out without a session and forgets a stale profile', async () => {
    localStorage.setItem('mkdocseditor.user', JSON.stringify({ username: 'old', role: 'editor' }))
    let ended = 0
    const { store } = withClient({
      'GET /auth/status/': () => json(authStatus()),
      'GET /auth/whoami/': unauthenticated,
    })
    store.$onAction(({ name }) => {
      if (name === 'endSession') ended++
    })
    expect(store.isLoggedIn).toBe(true)
    await store.ensureChecked()
    expect(store.isLoggedIn).toBe(false)
    expect(store.sessionEnded).toBe(false)
    expect(ended).toBe(0)
    expect(localStorage.getItem('mkdocseditor.user')).toBeNull()
  })

  it('trusts the stored profile while the server is unreachable', async () => {
    localStorage.setItem('mkdocseditor.user', JSON.stringify(user({ role: 'editor' })))
    setApiClient(
      new ApiClient({
        baseUrl: 'http://backend',
        fetchFn: () => Promise.reject(new TypeError('Failed to fetch')),
      }),
    )
    const store = useAuthStore()
    await store.ensureChecked()
    expect(store.isLoggedIn).toBe(true)
    expect(store.offline).toBe(true)
    expect(store.role).toBe('editor')
  })

  it('knows when setup is needed and when auth is disabled', async () => {
    const { store } = withClient({
      'GET /auth/status/': () => json(authStatus({ setupRequired: true })),
      'GET /auth/whoami/': unauthenticated,
    })
    await store.ensureChecked()
    expect(store.setupRequired).toBe(true)
    expect(store.isLoggedIn).toBe(false)

    setActivePinia(createPinia())
    const open = withClient({ 'GET /auth/status/': () => json(authStatus({ authDisabled: true })) })
    await open.store.ensureChecked()
    expect(open.store.anonymous).toBe(true)
    expect(open.store.isLoggedIn).toBe(true)
  })

  it('ends the session when a request finds it gone', async () => {
    const { store } = withClient({ 'GET /section/': unauthenticated })
    store.signedIn(user())
    await expect(useApi().getTree()).rejects.toMatchObject({ status: 401 })
    expect(store.isLoggedIn).toBe(false)
    expect(store.sessionEnded).toBe(true)
  })

  it('signs out on the server and locally, also when offline', async () => {
    const { store, requests } = withClient({
      'POST /auth/logout/': () => new Response(null, { status: 204 }),
    })
    store.signedIn(user())
    await store.logout()
    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /auth/logout/',
    ])
    expect(requests[0]?.headers.get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(store.isLoggedIn).toBe(false)

    setApiClient(
      new ApiClient({ baseUrl: 'http://b', fetchFn: () => Promise.reject(new TypeError('x')) }),
    )
    store.signedIn(user())
    await store.logout()
    expect(store.isLoggedIn).toBe(false)
  })

  it('marks restricted sessions', () => {
    const { store } = withClient({})
    store.signedIn(user({ secondFactorSetupRequired: true }))
    expect(store.secondFactorSetupRequired).toBe(true)
  })
})
