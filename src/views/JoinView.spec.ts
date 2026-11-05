import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { loadAccessRequest, saveAccessRequest, takeJoinTarget } from '@/services/join'
import { createFetchMock, json } from '@/test/fetchMock'
import { authStatus } from '@/test/fixtures'
import { mountWithPlugins, stubRoutes } from '@/test/mount'

import JoinView from './JoinView.vue'

const routes = [
  ...stubRoutes().filter((r) => r.name !== 'join'),
  { path: '/join/:id', name: 'join', component: JoinView, props: true, meta: { public: true } },
]
const PATH = '/join/d1?from=sender'
const q = (selector: string) => document.querySelector<HTMLElement>(selector)

type Routes = Parameters<typeof createFetchMock>[0]

function backend(extra: Routes = {}, features = ['access-requests']) {
  const mock = createFetchMock({
    'GET /auth/status/': () => json(authStatus()),
    'GET /auth/whoami/': () => json({ code: 'unauthorized' }, 401),
    'GET /server-info/': () => json({ name: 'My Wiki', features }),
    ...extra,
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  return mock
}

/** JoinView gets its id as a prop only through the route, so it is mounted at the route's view. */
async function open() {
  const { RouterView } = await import('vue-router')
  const result = await mountWithPlugins(RouterView, { routes, initialPath: PATH })
  await flushPromises()
  return result
}

describe('JoinView', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('goes straight to the document with a session, into the editor', async () => {
    backend({
      'GET /auth/whoami/': () => json({ id: 'me', username: 'me', role: 'editor' }),
    })
    const { wrapper, router } = await open()
    const { name, params, query } = router.currentRoute.value
    expect(name).toBe('document')
    expect(params.id).toBe('d1')
    expect(query).toEqual({ join: '1', from: 'sender' })
    wrapper.unmount()
  })

  it('offers both ways without a session, with the name of the instance', async () => {
    backend()
    const { wrapper } = await open()
    expect(document.body.textContent).toContain('My Wiki')
    expect(q('[data-testid="join-sign-in"]')).not.toBeNull()
    expect(q('[data-testid="join-request"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('offers no request when the server does not accept them', async () => {
    backend({}, [])
    const { wrapper } = await open()
    expect(q('[data-testid="join-sign-in"]')).not.toBeNull()
    expect(q('[data-testid="join-request"]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the link across the sign-in', async () => {
    backend()
    const { wrapper, router } = await open()
    q('[data-testid="join-sign-in"]')!.click()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe(PATH)
    expect(takeJoinTarget()).toBe(PATH)
    wrapper.unmount()
  })

  it('sends a request, keeps the token out of the address, and waits', async () => {
    const mock = backend({
      'POST /auth/access-requests/': () =>
        json(
          { requestId: 'r1', token: 'mda_secret', status: 'pending', expiresAt: '2026-11-12' },
          201,
        ),
      'POST /auth/access-requests/status/': () => json({ status: 'pending' }),
    })
    const { wrapper, router } = await open()
    q('[data-testid="join-request"]')!.click()
    await flushPromises()
    const name = q('[data-testid="join-name"] input') as HTMLInputElement
    name.value = 'Anna'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    q('[data-testid="join-form"]')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    const sent = mock.requests.find((r) => r.url.endsWith('/auth/access-requests/'))
    expect(JSON.parse(String(sent?.body))).toEqual({
      name: 'Anna',
      documentId: 'd1',
      invitedBy: 'sender',
    })
    expect(q('[data-testid="join-waiting"]')).not.toBeNull()
    expect(loadAccessRequest()?.token).toBe('mda_secret')
    expect(router.currentRoute.value.fullPath).not.toContain('mda_')
    expect(takeJoinTarget()).toBe(PATH)
    wrapper.unmount()
  })

  it('continues with the invite once approved', async () => {
    saveAccessRequest({ token: 'mda_secret', expiresAt: '2026-11-12' })
    backend({
      'POST /auth/access-requests/status/': () =>
        json({ status: 'approved', inviteToken: 'mdl_invite' }),
    })
    const { wrapper, router } = await open()
    expect(router.currentRoute.value.name).toBe('invite')
    expect(router.currentRoute.value.hash).toBe('#mdl_invite')
    wrapper.unmount()
  })

  it.each([
    ['rejected', 'rejected'],
    ['expired', 'in time'],
  ])('says when the request ended as %s, and forgets it', async (status, text) => {
    saveAccessRequest({ token: 'mda_secret', expiresAt: '2026-11-12' })
    backend({ 'POST /auth/access-requests/status/': () => json({ status }) })
    const { wrapper } = await open()
    expect(q('[data-testid="join-decided"]')?.textContent).toContain(text)
    expect(loadAccessRequest()).toBeNull()
    wrapper.unmount()
  })

  it('keeps the request while the server does not accept requests', async () => {
    saveAccessRequest({ token: 'mda_secret', expiresAt: '2026-11-12' })
    backend({
      'POST /auth/access-requests/status/': () =>
        json({ code: 'access-requests-disabled', error: 'off' }, 403),
    })
    const { wrapper } = await open()
    expect(q('[data-testid="join-decided"]')?.textContent).toContain('does not accept')
    expect(loadAccessRequest()).not.toBeNull()
    wrapper.unmount()
  })

  it('shows a full queue as a clear message', async () => {
    backend({
      'POST /auth/access-requests/': () =>
        json({ code: 'too-many-access-requests', error: 'full' }, 429),
    })
    const { wrapper } = await open()
    q('[data-testid="join-request"]')!.click()
    await flushPromises()
    const name = q('[data-testid="join-name"] input') as HTMLInputElement
    name.value = 'Anna'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    q('[data-testid="join-form"]')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(document.body.textContent).toContain('Too many requests are waiting')
    expect(useAuthStore().isLoggedIn).toBe(false)
    wrapper.unmount()
  })
})
