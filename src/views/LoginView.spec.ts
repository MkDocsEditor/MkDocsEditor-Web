import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import type { RecordedRequest } from '@/test/fetchMock'
import { authStatus, sessionResponse } from '@/test/fixtures'
import { mountWithPlugins, stubRoutes } from '@/test/mount'

import LoginView from './LoginView.vue'

const passkeys = vi.hoisted(() => ({
  getPasskey: vi.fn<(options: unknown, autofill?: boolean) => Promise<unknown>>(async () => ({
    id: 'cred-1',
  })),
  autofill: false,
}))
vi.mock('@/services/passkeys', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/passkeys')>()
  return {
    ...original,
    passkeysSupported: () => true,
    passkeyAutofillSupported: async () => passkeys.autofill,
    getPasskey: passkeys.getPasskey,
    cancelPasskeyRequest: () => {},
  }
})

const routes = [
  ...stubRoutes().filter((r) => r.name !== 'login'),
  { path: '/login', name: 'login', component: LoginView },
]

type Routes = Parameters<typeof createFetchMock>[0]

function backend(extra: Routes = {}) {
  const mock = createFetchMock({ 'GET /auth/status/': () => json(authStatus()), ...extra })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  return mock
}

function body(request: RecordedRequest | undefined): Record<string, unknown> {
  return JSON.parse(String(request?.body)) as Record<string, unknown>
}

async function mount(path = '/login') {
  const result = await mountWithPlugins(LoginView, { routes, initialPath: path })
  await flushPromises()
  return result
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof mount>>['wrapper']) {
  await wrapper.find('input[name="username"]').setValue('anna')
  await wrapper.find('input[name="password"]').setValue('pw')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

const bad =
  (code: string, status = 401, details = {}) =>
  () =>
    json({ code, message: code, details }, status)

describe('LoginView', () => {
  beforeEach(() => {
    localStorage.clear()
    passkeys.getPasskey.mockClear()
    passkeys.autofill = false
  })
  afterEach(() => setApiClient(null))

  it('has the autocomplete attributes password managers need', async () => {
    backend()
    const { wrapper } = await mount()
    expect(wrapper.find('input[name="username"]').attributes('autocomplete')).toBe(
      'username webauthn',
    )
    expect(wrapper.find('input[name="password"]').attributes('autocomplete')).toBe(
      'current-password',
    )
    expect(wrapper.find('input[name="password"]').attributes('type')).toBe('password')
    wrapper.unmount()
  })

  it('logs in with a cookie session and follows the redirect', async () => {
    const mock = backend({ 'POST /auth/login/': () => json(sessionResponse()) })
    const { wrapper, router } = await mount('/login?redirect=/document/d1')
    await fillAndSubmit(wrapper)
    const login = mock.requests.find((r) => r.url.endsWith('/auth/login/'))
    expect(body(login)).toEqual({ username: 'anna', password: 'pw', sessionType: 'cookie' })
    expect(login?.credentials).toBe('include')
    expect(useAuthStore().isLoggedIn).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/document/d1')
    wrapper.unmount()
  })

  it('ignores redirects to other hosts', async () => {
    backend({ 'POST /auth/login/': () => json(sessionResponse()) })
    const { wrapper, router } = await mount('/login?redirect=//evil.example/x')
    await fillAndSubmit(wrapper)
    expect(router.currentRoute.value.fullPath).toBe('/')
    wrapper.unmount()
  })

  it('shows a generic message for wrong credentials', async () => {
    backend({ 'POST /auth/login/': bad('invalid-credentials') })
    const { wrapper, router } = await mount()
    await fillAndSubmit(wrapper)
    expect(wrapper.find('[data-testid="login-error"]').text()).toBe('Wrong username or password.')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(useAuthStore().sessionEnded).toBe(false)
    wrapper.unmount()
  })

  it('tells how long to wait when rate limited', async () => {
    backend({
      'POST /auth/login/': () =>
        new Response(JSON.stringify({ code: 'rate-limited', message: 'x' }), {
          status: 429,
          headers: { 'Retry-After': '30' },
        }),
    })
    const { wrapper } = await mount()
    await fillAndSubmit(wrapper)
    expect(wrapper.find('[data-testid="login-error"]').text()).toContain('30 seconds')
    wrapper.unmount()
  })

  it('asks for the TOTP code, then accepts a recovery code instead', async () => {
    const mock = backend({
      'POST /auth/login/': () =>
        json({
          status: 'second-factor-required',
          challenge: 'mdc_1',
          methods: ['totp', 'recovery-code'],
          expiresAt: '',
        }),
      'POST /auth/login/second-factor/': (request) =>
        body(request).code === '123456'
          ? bad('invalid-second-factor', 401, { attemptsLeft: 4 })()
          : json(sessionResponse()),
    })
    const { wrapper, router } = await mount()
    await fillAndSubmit(wrapper)
    const otp = wrapper.find('[data-testid="totp-input"] input')
    expect(otp.attributes('autocomplete')).toBe('one-time-code')
    expect(otp.attributes('inputmode')).toBe('numeric')
    // pasted with a space; typing alone does not submit
    await otp.setValue('123 456')
    expect(mock.requests.filter((r) => r.url.includes('second-factor'))).toHaveLength(0)
    await wrapper.find('[data-testid="second-factor-form"]').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.at(-1))).toEqual({
      challenge: 'mdc_1',
      code: '123456',
      sessionType: 'cookie',
    })
    expect(wrapper.find('[data-testid="login-error"]').text()).toContain('4 attempts left')

    const switchButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Use a recovery code'))
    await switchButton?.trigger('click')
    await wrapper.find('[data-testid="recovery-input"] input').setValue('abcd-efgh-jkmn')
    await wrapper.find('[data-testid="second-factor-form"]').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.at(-1))).toEqual({
      challenge: 'mdc_1',
      recoveryCode: 'abcd-efgh-jkmn',
      sessionType: 'cookie',
    })
    expect(router.currentRoute.value.fullPath).toBe('/')
    wrapper.unmount()
  })

  it('starts over when the challenge expired', async () => {
    backend({
      'POST /auth/login/': () =>
        json({
          status: 'second-factor-required',
          challenge: 'mdc_1',
          methods: ['totp'],
          expiresAt: '',
        }),
      'POST /auth/login/second-factor/': bad('challenge-expired'),
    })
    const { wrapper } = await mount()
    await fillAndSubmit(wrapper)
    await wrapper.find('[data-testid="totp-input"] input').setValue('111111')
    await wrapper.find('[data-testid="second-factor-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="login-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-error"]').text()).toContain('expired')
    wrapper.unmount()
  })

  it('signs in with a passkey without a username', async () => {
    const mock = backend({
      'POST /auth/passkey/login/begin/': () =>
        json({ ceremonyId: 'cer-1', publicKey: { challenge: 'abc' } }),
      'POST /auth/passkey/login/finish/': () => json(sessionResponse({ role: 'editor' })),
    })
    const { wrapper, router } = await mount()
    await wrapper.find('[data-testid="passkey-login"]').trigger('click')
    await flushPromises()
    expect(passkeys.getPasskey).toHaveBeenCalledWith({ challenge: 'abc' })
    expect(body(mock.requests.at(-1))).toEqual({
      ceremonyId: 'cer-1',
      credential: { id: 'cred-1' },
      sessionType: 'cookie',
    })
    expect(useAuthStore().role).toBe('editor')
    expect(router.currentRoute.value.fullPath).toBe('/')
    wrapper.unmount()
  })

  it('offers passkeys in the autofill where supported', async () => {
    passkeys.autofill = true
    passkeys.getPasskey.mockImplementationOnce(() => new Promise(() => {}))
    backend({
      'POST /auth/passkey/login/begin/': () => json({ ceremonyId: 'c', publicKey: { x: 1 } }),
    })
    const { wrapper } = await mount()
    expect(passkeys.getPasskey).toHaveBeenCalledWith({ x: 1 }, true)
    wrapper.unmount()
  })

  it('goes to the setup while no account exists', async () => {
    const mock = createFetchMock({
      'GET /auth/status/': () => json(authStatus({ setupRequired: true })),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
    const { wrapper, router } = await mount()
    expect(router.currentRoute.value.name).toBe('setup')
    wrapper.unmount()
  })

  it('explains an ended session', async () => {
    backend()
    const { pinia } = await mountWithPlugins({ render: () => null })
    const auth = useAuthStore(pinia)
    auth.signedIn(sessionResponse().user)
    auth.endSession()
    const { wrapper } = await mountWithPlugins(LoginView, { routes, initialPath: '/login', pinia })
    await flushPromises()
    expect(wrapper.find('[data-testid="session-ended"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
