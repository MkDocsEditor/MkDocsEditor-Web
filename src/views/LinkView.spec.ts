import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { passkeyReminderDue } from '@/services/passkeyReminder'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import type { RecordedRequest } from '@/test/fetchMock'
import { authStatus, sessionResponse } from '@/test/fixtures'
import { mountWithPlugins, stubRoutes } from '@/test/mount'

import LinkView from './LinkView.vue'

const passkeys = vi.hoisted(() => ({
  createPasskey: vi.fn<(options: unknown) => Promise<unknown>>(async () => ({ id: 'new-cred' })),
}))
vi.mock('@/services/passkeys', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/passkeys')>()
  return { ...original, passkeysSupported: () => true, createPasskey: passkeys.createPasskey }
})

const routes = [
  ...stubRoutes().filter((r) => !['setup', 'invite', 'reset'].includes(String(r.name))),
  { path: '/setup', name: 'setup', component: LinkView, props: { kind: 'setup' } },
  { path: '/invite', name: 'invite', component: LinkView, props: { kind: 'invite' } },
  { path: '/reset', name: 'reset', component: LinkView, props: { kind: 'reset' } },
]

function body(request: RecordedRequest | undefined): Record<string, unknown> {
  return JSON.parse(String(request?.body)) as Record<string, unknown>
}

function backend(extra: Parameters<typeof createFetchMock>[0]) {
  const mock = createFetchMock({ 'GET /auth/status/': () => json(authStatus()), ...extra })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  return mock
}

async function mount(path: string) {
  const result = await mountWithPlugins(LinkView, { routes, initialPath: path })
  await flushPromises()
  return result
}

const invite = {
  kind: 'invite',
  role: 'editor',
  note: 'for Anna',
  expiresAt: '2026-11-07T10:00:00Z',
}

describe('LinkView', () => {
  beforeEach(() => {
    localStorage.clear()
    passkeys.createPasskey.mockClear()
  })
  afterEach(() => setApiClient(null))

  it('reads the token from the fragment, removes it from the address and shows the invite', async () => {
    const mock = backend({ 'POST /auth/link/inspect/': () => json(invite) })
    const { wrapper, router } = await mount('/invite#mdl_token1')
    expect(router.currentRoute.value.hash).toBe('')
    expect(body(mock.requests.find((r) => r.url.endsWith('/inspect/')))).toEqual({
      token: 'mdl_token1',
    })
    // never in a URL
    expect(mock.requests.every((r) => !r.url.includes('mdl_'))).toBe(true)
    const info = wrapper.find('[data-testid="link-info"]').text()
    expect(info).toContain('Editor')
    expect(info).toContain('for Anna')
    expect(info).toContain('Valid until')
    wrapper.unmount()
  })

  it('takes a link opened while the page is already shown', async () => {
    const mock = backend({ 'POST /auth/link/inspect/': () => json(invite) })
    const { wrapper, router } = await mount('/invite')
    expect(wrapper.find('[data-testid="token-form"]').exists()).toBe(true)
    await router.push('/invite#mdl_token2')
    await flushPromises()
    expect(router.currentRoute.value.hash).toBe('')
    expect(body(mock.requests.find((r) => r.url.endsWith('/inspect/')))).toEqual({
      token: 'mdl_token2',
    })
    expect(wrapper.find('[data-testid="link-info"]').text()).toContain('for Anna')
    wrapper.unmount()
  })

  it('creates the account with a password and signs in', async () => {
    const mock = backend({
      'POST /auth/link/inspect/': () => json(invite),
      'POST /auth/link/redeem/': () => json(sessionResponse({ username: 'anna2', role: 'editor' })),
    })
    const { wrapper } = await mount('/invite#mdl_token1')
    expect(wrapper.find('input[name="username"]').attributes('autocomplete')).toBe('username')
    const passwords = wrapper.findAll('input[type="password"]')
    expect(passwords.map((p) => p.attributes('autocomplete'))).toEqual([
      'new-password',
      'new-password',
    ])
    await wrapper.find('input[name="username"]').setValue('anna2')
    await wrapper.find('input[name="name"]').setValue('Anna Zwei')
    await passwords[0]?.setValue('a long password')
    await passwords[1]?.setValue('a long password')
    await flushPromises()
    await wrapper.find('[data-testid="link-form"]').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.at(-1))).toEqual({
      token: 'mdl_token1',
      username: 'anna2',
      displayName: 'Anna Zwei',
      password: 'a long password',
      sessionType: 'cookie',
    })
    expect(useAuthStore().username).toBe('anna2')
    expect(wrapper.find('[data-testid="link-done"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('suggests a passkey right after the account is created', async () => {
    const mock = backend({
      'POST /auth/link/inspect/': () => json(invite),
      'POST /auth/link/redeem/': () =>
        json(sessionResponse({ username: 'anna2', role: 'editor', passkeyCount: 0 })),
      'POST /account/passkeys/begin/': () => json({ ceremonyId: 'c1', publicKey: { a: 1 } }),
      'POST /account/passkeys/finish/': () =>
        json({ id: 'p1', name: 'Passkey', createdAt: '2026-11-01T10:00:00Z' }),
      'GET /auth/whoami/': () => json({ ...sessionResponse().user, username: 'anna2' }),
    })
    const { wrapper } = await mount('/invite#mdl_token1')
    await wrapper.find('input[name="username"]').setValue('anna2')
    const passwords = wrapper.findAll('input[type="password"]')
    await passwords[0]?.setValue('a long password')
    await passwords[1]?.setValue('a long password')
    await flushPromises()
    await wrapper.find('[data-testid="link-form"]').trigger('submit')
    await flushPromises()
    const step = wrapper.find('[data-testid="passkey-step"]')
    expect(step.text()).toContain('Sign in with a passkey next time')
    expect(step.text()).toContain('Bitwarden')
    await step.find('[data-testid="passkey-step-create"]').trigger('click')
    await flushPromises()
    expect(passkeys.createPasskey).toHaveBeenCalledWith({ a: 1 })
    expect(mock.requests.some((r) => r.url.endsWith('/account/passkeys/finish/'))).toBe(true)
    // no step-up: the new session may add a passkey right away
    expect(mock.requests.some((r) => r.url.includes('/auth/reauth/'))).toBe(false)
    expect(wrapper.find('[data-testid="passkey-step"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="link-done"]').text()).toContain('Passkey created')
    wrapper.unmount()
  })

  it('puts the passkey off with "Later"', async () => {
    backend({
      'POST /auth/link/inspect/': () => json(invite),
      'POST /auth/link/redeem/': () =>
        json(sessionResponse({ username: 'anna2', role: 'editor', passkeyCount: 0 })),
    })
    const { wrapper } = await mount('/invite#mdl_token1')
    await wrapper.find('input[name="username"]').setValue('anna2')
    const passwords = wrapper.findAll('input[type="password"]')
    await passwords[0]?.setValue('a long password')
    await passwords[1]?.setValue('a long password')
    await flushPromises()
    await wrapper.find('[data-testid="link-form"]').trigger('submit')
    await flushPromises()
    await wrapper.find('[data-testid="passkey-step-later"]').trigger('click')
    expect(wrapper.find('[data-testid="passkey-step"]').exists()).toBe(false)
    expect(passkeyReminderDue('anna2')).toBe(false)
    wrapper.unmount()
  })

  it('does not submit mismatching or short passwords', async () => {
    const mock = backend({ 'POST /auth/link/inspect/': () => json(invite) })
    const { wrapper } = await mount('/invite#mdl_token1')
    await wrapper.find('input[name="username"]').setValue('anna2')
    const passwords = wrapper.findAll('input[type="password"]')
    await passwords[0]?.setValue('kurz')
    await passwords[1]?.setValue('anders')
    await flushPromises()
    await wrapper.find('[data-testid="link-form"]').trigger('submit')
    await flushPromises()
    expect(mock.requests.some((r) => r.url.endsWith('/redeem/'))).toBe(false)
    expect(wrapper.text()).toContain('At least 10 characters')
    wrapper.unmount()
  })

  it('shows backend errors like a taken username or a weak password', async () => {
    backend({
      'POST /auth/link/inspect/': () => json(invite),
      'POST /auth/link/redeem/': () =>
        json({ code: 'weak-password', message: 'x', details: { reason: 'common' } }, 400),
    })
    const { wrapper } = await mount('/invite#mdl_token1')
    await wrapper.find('input[name="username"]').setValue('anna2')
    for (const input of wrapper.findAll('input[type="password"]'))
      await input.setValue('passwort123')
    await flushPromises()
    await wrapper.find('[data-testid="link-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="link-form-error"]').text()).toContain('too common')
    wrapper.unmount()
  })

  it('explains invalid links', async () => {
    backend({ 'POST /auth/link/inspect/': () => json({ code: 'invalid-link', message: 'x' }, 400) })
    const { wrapper } = await mount('/invite#mdl_old')
    expect(wrapper.find('[data-testid="link-error"]').text()).toContain('invalid')
    wrapper.unmount()
  })

  it('sets up the first admin with a passkey', async () => {
    const mock = backend({
      'POST /auth/link/inspect/': () => json({ kind: 'setup', role: 'admin', expiresAt: '' }),
      'POST /auth/link/passkey/begin/': () => json({ ceremonyId: 'c1', publicKey: { rp: {} } }),
      'POST /auth/link/passkey/finish/': () => json(sessionResponse({ username: 'markus' })),
    })
    const { wrapper } = await mount('/setup#mdl_setup')
    expect(wrapper.find('[data-testid="link-info"]').text()).toContain('Admin')
    await wrapper.find('input[name="username"]').setValue('markus')
    await wrapper.find('[data-testid="link-passkey"]').trigger('click')
    await flushPromises()
    const begin = mock.requests.find((r) => r.url.endsWith('/passkey/begin/'))
    expect(body(begin)).toEqual({ token: 'mdl_setup', username: 'markus' })
    expect(passkeys.createPasskey).toHaveBeenCalledWith({ rp: {} })
    expect(body(mock.requests.at(-1))).toMatchObject({
      ceremonyId: 'c1',
      credential: { id: 'new-cred' },
      sessionType: 'cookie',
    })
    expect(useAuthStore().username).toBe('markus')
    wrapper.unmount()
  })

  it('accepts a pasted setup token', async () => {
    const mock = backend({
      'POST /auth/link/inspect/': () => json({ kind: 'setup', role: 'admin', expiresAt: '' }),
    })
    const { wrapper } = await mount('/setup')
    await wrapper.find('[data-testid="token-input"] input').setValue(' mdl_pasted ')
    await wrapper.find('[data-testid="token-form"]').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.at(-1))).toEqual({ token: 'mdl_pasted' })
    expect(wrapper.find('[data-testid="link-form"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('resets the password with a hidden username for password managers', async () => {
    const mock = backend({
      'POST /auth/link/inspect/': () =>
        json({
          kind: 'reset',
          username: 'bob',
          displayName: 'Bob',
          resetSecondFactors: true,
          expiresAt: '',
        }),
      'POST /auth/link/redeem/': () => json(sessionResponse({ username: 'bob' })),
    })
    const { wrapper } = await mount('/reset#mdl_reset')
    const hidden = wrapper.find('input[name="username"]')
    expect(hidden.attributes('autocomplete')).toBe('username')
    expect((hidden.element as HTMLInputElement).value).toBe('bob')
    expect(wrapper.find('[data-testid="link-info"]').text()).toContain('passkeys are removed')
    for (const input of wrapper.findAll('input[type="password"]'))
      await input.setValue('new password!')
    await flushPromises()
    await wrapper.find('[data-testid="link-form"]').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.at(-1))).toEqual({
      token: 'mdl_reset',
      password: 'new password!',
      sessionType: 'cookie',
    })
    expect(wrapper.find('[data-testid="link-done"]').text()).toContain('New password set')
    wrapper.unmount()
  })
})
