import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import type { AccountInfo } from '@/api'
import ReauthDialog from '@/components/auth/ReauthDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import type { RecordedRequest } from '@/test/fetchMock'
import { account, authStatus, user } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import AccountView from './AccountView.vue'

const passkeys = vi.hoisted(() => ({
  createPasskey: vi.fn<(options: unknown) => Promise<unknown>>(async () => ({ id: 'new-cred' })),
  getPasskey: vi.fn<(options: unknown) => Promise<unknown>>(async () => ({ id: 'cred' })),
}))
vi.mock('@/services/passkeys', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/passkeys')>()
  return {
    ...original,
    passkeysSupported: () => true,
    createPasskey: passkeys.createPasskey,
    getPasskey: passkeys.getPasskey,
  }
})

type Routes = Parameters<typeof createFetchMock>[0]

function body(request: RecordedRequest | undefined): Record<string, unknown> {
  return JSON.parse(String(request?.body)) as Record<string, unknown>
}

const reauthRequired = () => json({ code: 'reauth-required', message: 'reauth' }, 403)

/** A backend that wants a step-up once for `path`, then accepts it. */
function stepUpOnce(path: string, response: () => Response) {
  let reauthenticated = false
  return {
    [path]: () => (reauthenticated ? response() : reauthRequired()),
    'POST /auth/reauth/': (request: RecordedRequest) => {
      if (body(request).password !== 'my password!')
        return json({ code: 'invalid-credentials', message: 'x' }, 401)
      reauthenticated = true
      return json({ reauthenticatedUntil: '' })
    },
  }
}

let current: AccountInfo

async function mount(tab: string, routes: Routes = {}, info: Partial<AccountInfo> = {}) {
  current = account(info)
  const mock = createFetchMock({
    'GET /auth/status/': () => json(authStatus()),
    'GET /account/': () => json(current),
    'GET /account/passkeys/': () => json([]),
    'GET /account/sessions/': () => json([]),
    ...routes,
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  const Page = defineComponent({
    render: () => [h(AccountView, { tab }), h(ReauthDialog)],
  })
  const result = await mountWithPlugins(Page)
  const auth = useAuthStore()
  auth.signedIn(user())
  await auth.loadStatus()
  await flushPromises()
  return { ...result, mock }
}

function byTestId(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  if (!element) throw new Error(`no ${id}`)
  return element
}

async function typeInto(id: string, value: string): Promise<void> {
  const input = byTestId(id).querySelector('input') ?? (byTestId(id) as HTMLInputElement)
  ;(input as HTMLInputElement).value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function confirmReauth(password = 'my password!'): Promise<void> {
  expect(document.querySelector('[data-testid="reauth-dialog"]')).not.toBeNull()
  await typeInto('reauth-password', password)
  byTestId('reauth-confirm').click()
  await flushPromises()
}

describe('AccountView', () => {
  beforeEach(() => {
    localStorage.clear()
    passkeys.createPasskey.mockClear()
    passkeys.getPasskey.mockClear()
  })
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('saves the profile', async () => {
    const { wrapper, mock } = await mount('profile', {
      'PATCH /account/': (request) => {
        current = { ...current, ...body(request) }
        return json(current)
      },
    })
    await wrapper.find('[data-testid="profile-display-name"] input').setValue('Anna B.')
    await wrapper.find('[data-testid="profile-color"] input').setValue('#e8590c')
    await wrapper.find('[data-testid="profile-card"] form').trigger('submit')
    await flushPromises()
    const patch = mock.requests.find((r) => r.method === 'PATCH')
    expect(body(patch)).toEqual({ displayName: 'Anna B.', color: '#e8590c' })
    expect(useAuthStore().displayName).toBe('Anna B.')
    wrapper.unmount()
  })

  it('changes the password with the current one, with the fields managers expect', async () => {
    const { wrapper, mock } = await mount('security', {
      'PUT /account/password/': () => new Response(null, { status: 204 }),
    })
    const form = wrapper.find('[data-testid="password-form"]')
    const hidden = form.find('input[name="username"]')
    expect(hidden.attributes('autocomplete')).toBe('username')
    expect((hidden.element as HTMLInputElement).value).toBe('anna')
    expect(form.findAll('input[type="password"]').map((i) => i.attributes('autocomplete'))).toEqual(
      ['current-password', 'new-password', 'new-password'],
    )
    await form.find('[data-testid="current-password"] input').setValue('old password')
    await form.find('[data-testid="new-password"] input').setValue('a new long password')
    await form.find('[data-testid="new-password-repeat"] input').setValue('a new long password')
    await flushPromises()
    await form.trigger('submit')
    await flushPromises()
    expect(body(mock.requests.find((r) => r.method === 'PUT'))).toEqual({
      newPassword: 'a new long password',
      currentPassword: 'old password',
    })
    wrapper.unmount()
  })

  it('enrolls TOTP after a step-up and shows the recovery codes once', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `abcd-efgh-${String(i).padStart(4, '0')}`)
    const { wrapper, mock } = await mount('security', {
      ...stepUpOnce('POST /account/totp/', () =>
        json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/MkDocsEditor:anna?secret=JBSWY3DPEHPK3PXP&issuer=MkDocsEditor',
          expiresAt: '',
        }),
      ),
      'POST /account/totp/confirm/': (request) => {
        if (body(request).code !== '123456')
          return json({ code: 'invalid-second-factor', message: 'x' }, 400)
        current = { ...current, totpEnabled: true, recoveryCodesLeft: 10 }
        return json({ recoveryCodes: codes })
      },
    })
    await wrapper.find('[data-testid="totp-enroll"]').trigger('click')
    await flushPromises()
    // wrong password first
    await confirmReauth('wrong')
    expect(byTestId('reauth-dialog').textContent).toContain('Wrong password.')
    await confirmReauth()
    // retried after the step-up
    expect(mock.requests.filter((r) => r.url.endsWith('/account/totp/'))).toHaveLength(2)
    expect(wrapper.find('[data-testid="qr-code"]').exists()).toBe(true)
    expect(
      (wrapper.find('[data-testid="totp-secret"] input').element as HTMLInputElement).value,
    ).toBe('JBSW Y3DP EHPK 3PXP')
    expect(
      (wrapper.find('[data-testid="totp-uri"] input').element as HTMLInputElement).value,
    ).toContain('otpauth://totp/')
    const code = wrapper.find('[data-testid="totp-confirm-code"] input')
    expect(code.attributes('autocomplete')).toBe('one-time-code')
    await code.setValue('123 456')
    await wrapper.find('[data-testid="totp-confirm-form"]').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.find((r) => r.url.endsWith('/confirm/')))).toEqual({
      code: '123456',
    })
    const shown = wrapper.find('[data-testid="recovery-codes"]').text()
    for (const c of codes) expect(shown).toContain(c)
    wrapper.unmount()
  })

  it('does nothing when the step-up is cancelled', async () => {
    const { wrapper, mock } = await mount('security', { 'POST /account/totp/': reauthRequired })
    await wrapper.find('[data-testid="totp-enroll"]').trigger('click')
    await flushPromises()
    const cancel = [...byTestId('reauth-dialog').querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancel',
    )
    cancel?.click()
    await flushPromises()
    expect(mock.requests.filter((r) => r.url.endsWith('/account/totp/'))).toHaveLength(1)
    expect(wrapper.find('[data-testid="qr-code"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('confirms a step-up with a passkey', async () => {
    let reauthenticated = false
    const { wrapper, mock } = await mount(
      'security',
      {
        'POST /account/recovery-codes/': () =>
          reauthenticated ? json({ recoveryCodes: ['aaaa-bbbb-cccc'] }) : reauthRequired(),
        'POST /auth/reauth/passkey/begin/': () => json({ ceremonyId: 'r1', publicKey: { a: 1 } }),
        'POST /auth/reauth/passkey/finish/': () => {
          reauthenticated = true
          return json({ reauthenticatedUntil: '' })
        },
      },
      { totpEnabled: true, recoveryCodesLeft: 3, passkeyCount: 1 },
    )
    expect(wrapper.find('[data-testid="recovery-left"]').text()).toContain('3 of 10')
    await wrapper.find('[data-testid="totp-regenerate"]').trigger('click')
    await flushPromises()
    byTestId('confirm-button').click()
    await flushPromises()
    // the account has TOTP: the dialog asks for password and code, or a passkey
    expect(document.querySelector('[data-testid="reauth-code"]')).not.toBeNull()
    byTestId('reauth-passkey').click()
    await flushPromises()
    expect(passkeys.getPasskey).toHaveBeenCalledWith({ a: 1 })
    expect(body(mock.requests.find((r) => r.url.endsWith('/passkey/finish/')))).toEqual({
      ceremonyId: 'r1',
      credential: { id: 'cred' },
    })
    expect(wrapper.find('[data-testid="recovery-codes"]').text()).toContain('aaaa-bbbb-cccc')
    wrapper.unmount()
  })

  it('adds, renames and deletes passkeys', async () => {
    let list = [{ id: 'p1', name: 'Pixel 8', createdAt: '2026-10-01T10:00:00Z' }]
    const { wrapper, mock } = await mount('security', {
      'GET /account/passkeys/': () => json(list),
      'POST /account/passkeys/begin/': () => json({ ceremonyId: 'c2', publicKey: { b: 2 } }),
      'POST /account/passkeys/finish/': () => {
        list = [...list, { id: 'p2', name: 'Bitwarden', createdAt: '2026-10-31T10:00:00Z' }]
        return json(list[1])
      },
      'PATCH /account/passkeys/p1/': (request) => {
        list = [{ ...list[0]!, name: String(body(request).name) }, ...list.slice(1)]
        return json(list[0])
      },
      'DELETE /account/passkeys/p2/': () => {
        list = list.filter((p) => p.id !== 'p2')
        return new Response(null, { status: 204 })
      },
    })
    expect(wrapper.find('[data-testid="passkey-list"]').text()).toContain('Pixel 8')

    await wrapper.find('[data-testid="passkey-add"]').trigger('click')
    await flushPromises()
    expect(passkeys.createPasskey).toHaveBeenCalledWith({ b: 2 })
    expect(body(mock.requests.find((r) => r.url.endsWith('/passkeys/finish/')))).toMatchObject({
      ceremonyId: 'c2',
      credential: { id: 'new-cred' },
    })
    expect(wrapper.find('[data-testid="passkey-list"]').text()).toContain('Bitwarden')

    await wrapper.find('[aria-label="Rename Pixel 8"]').trigger('click')
    await flushPromises()
    await typeInto('passkey-name', 'Phone')
    byTestId('passkey-name').closest('form')?.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(wrapper.find('[data-testid="passkey-list"]').text()).toContain('Phone')

    await wrapper.find('[aria-label="Remove Bitwarden"]').trigger('click')
    await flushPromises()
    byTestId('confirm-button').click()
    await flushPromises()
    expect(mock.requests.some((r) => r.method === 'DELETE')).toBe(true)
    expect(wrapper.find('[data-testid="passkey-list"]').text()).not.toContain('Bitwarden')
    wrapper.unmount()
  })

  it('signs out other devices', async () => {
    let sessions = [
      {
        id: 's1',
        type: 'cookie',
        deviceName: 'Firefox on Linux',
        createdAt: '',
        expiresAt: '',
        idleExpiresAt: '',
        current: true,
      },
      {
        id: 's2',
        type: 'bearer',
        deviceName: 'Pixel 8',
        ip: '192.168.2.50',
        createdAt: '',
        expiresAt: '',
        idleExpiresAt: '',
        current: false,
      },
      {
        id: 's3',
        type: 'cookie',
        deviceName: 'Chrome on Android',
        createdAt: '',
        expiresAt: '',
        idleExpiresAt: '',
        current: false,
      },
    ]
    const { wrapper, mock } = await mount('sessions', {
      'GET /account/sessions/': () => json(sessions),
      'DELETE /account/sessions/s2/': () => {
        sessions = sessions.filter((s) => s.id !== 's2')
        return new Response(null, { status: 204 })
      },
      'POST /account/sessions/revoke-others/': () => {
        sessions = sessions.filter((s) => s.current)
        return json({ revoked: 1 })
      },
    })
    expect(wrapper.find('[data-testid="session-current"]').text()).toContain('this device')
    await wrapper.find('[aria-label="Sign out Pixel 8"]').trigger('click')
    await flushPromises()
    expect(mock.requests.some((r) => r.method === 'DELETE' && r.url.endsWith('/s2/'))).toBe(true)
    await wrapper.find('[data-testid="revoke-others"]').trigger('click')
    await flushPromises()
    byTestId('confirm-button').click()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="session-other"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('asks for a second factor when the instance requires one', async () => {
    const { wrapper } = await mount(
      'security',
      {},
      { secondFactorSetupRequired: true, require2FA: true },
    )
    expect(wrapper.find('[data-testid="2fa-required"]').exists()).toBe(true)
    expect(useAuthStore().secondFactorSetupRequired).toBe(true)
    wrapper.unmount()
  })
})
