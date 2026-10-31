import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import type { AdminUser, LinkInfo } from '@/api'
import ReauthDialog from '@/components/auth/ReauthDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import type { RecordedRequest } from '@/test/fetchMock'
import { account, authStatus, user } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import AdminView from './AdminView.vue'

type Routes = Parameters<typeof createFetchMock>[0]

function body(request: RecordedRequest | undefined): Record<string, unknown> {
  return JSON.parse(String(request?.body)) as Record<string, unknown>
}

function adminUser(overrides: Partial<AdminUser>): AdminUser {
  return {
    ...user(),
    status: 'active',
    createdAt: '2026-10-01T10:00:00Z',
    lastLoginAt: null,
    hasPassword: true,
    totpEnabled: false,
    passkeyCount: 0,
    sessionCount: 1,
    ...overrides,
  }
}

function link(overrides: Partial<LinkInfo>): LinkInfo {
  return {
    id: 'l1',
    kind: 'invite',
    role: 'editor',
    note: null,
    createdAt: '2026-10-31T10:00:00Z',
    expiresAt: '2026-11-07T10:00:00Z',
    status: 'pending',
    ...overrides,
  }
}

async function mount(tab: string, routes: Routes) {
  const mock = createFetchMock({
    'GET /auth/status/': () => json(authStatus()),
    'GET /account/': () => json(account()),
    'GET /admin/reset-links/': () => json([]),
    ...routes,
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  const Page = defineComponent({ render: () => [h(AdminView, { tab }), h(ReauthDialog)] })
  const result = await mountWithPlugins(Page)
  useAuthStore().signedIn(user())
  await flushPromises()
  return { ...result, mock }
}

function byTestId(id: string, root: ParentNode = document): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  if (!element) throw new Error(`no ${id}`)
  return element
}

async function chooseOption(text: string): Promise<void> {
  const option = [...document.querySelectorAll<HTMLElement>('.v-overlay .v-list-item')].find(
    (item) => item.textContent?.trim() === text,
  )
  if (!option) throw new Error(`no option ${text}`)
  option.click()
  await flushPromises()
}

describe('AdminView', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('changes a role after a step-up', async () => {
    let users = [
      adminUser({}),
      adminUser({ id: 'u-bob', username: 'bob', displayName: 'Bob', role: 'editor' }),
    ]
    let reauthenticated = false
    const { wrapper, mock } = await mount('users', {
      'GET /admin/users/': () => json(users),
      'PATCH /admin/users/u-bob/': (request) => {
        if (!reauthenticated) return json({ code: 'reauth-required', message: 'x' }, 403)
        users = users.map((u) => (u.id === 'u-bob' ? { ...u, ...body(request) } : u))
        return json(users[1])
      },
      'POST /auth/reauth/': () => {
        reauthenticated = true
        return json({ reauthenticatedUntil: '' })
      },
    })
    const bob = byTestId('user-bob')
    byTestId('user-role', bob)
      .querySelector<HTMLElement>('.v-field')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    await chooseOption('Reader')
    // step-up
    const password = byTestId('reauth-password').querySelector('input') as HTMLInputElement
    password.value = 'pw'
    password.dispatchEvent(new Event('input'))
    await flushPromises()
    byTestId('reauth-confirm').click()
    await flushPromises()
    const patches = mock.requests.filter((r) => r.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(body(patches[1])).toEqual({ role: 'reader' })
    expect(byTestId('user-bob').textContent).toBeTruthy()
    wrapper.unmount()
  })

  it('creates a reset link and shows it with a QR code', async () => {
    const { wrapper, mock } = await mount('users', {
      'GET /admin/users/': () =>
        json([adminUser({ id: 'u-bob', username: 'bob', displayName: 'Bob', role: 'editor' })]),
      'POST /admin/users/u-bob/reset-link/': () =>
        json({
          link: link({ kind: 'reset', accountId: 'u-bob', role: null }),
          token: 'mdl_reset',
          url: 'https://edit.example/reset#mdl_reset',
        }),
    })
    await wrapper.find('[data-testid="user-actions"]').trigger('click')
    await flushPromises()
    byTestId('user-reset').click()
    await flushPromises()
    byTestId('reset-create').click()
    await flushPromises()
    expect(body(mock.requests.find((r) => r.url.endsWith('/reset-link/')))).toEqual({
      expiresInMinutes: 60,
      resetSecondFactors: false,
    })
    const result = byTestId('link-result')
    expect((byTestId('link-url', result).querySelector('input') as HTMLInputElement).value).toBe(
      'https://edit.example/reset#mdl_reset',
    )
    expect(result.querySelector('[data-testid="qr-code"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('creates invites, builds the link without clientUrl, and revokes them', async () => {
    let invites = [link({ id: 'old', note: 'for Grandma' })]
    const { wrapper, mock } = await mount('invites', {
      'GET /admin/invites/': () => json(invites),
      'POST /admin/invites/': (request) => {
        const created = link({ id: 'new', role: body(request).role as 'reader', note: 'Tom' })
        invites = [created, ...invites]
        return json({ invite: created, token: 'mdl_inv', url: null })
      },
      'DELETE /admin/invites/old/': () => {
        invites = invites.map((i) => (i.id === 'old' ? { ...i, status: 'revoked' as const } : i))
        return new Response(null, { status: 204 })
      },
    })
    expect(wrapper.find('[data-testid="invite-list"]').text()).toContain('for Grandma')
    await wrapper.find('[data-testid="invite-role"] .v-field').trigger('mousedown')
    await flushPromises()
    await chooseOption('Reader')
    await wrapper.find('[data-testid="invite-note"] input').setValue('Tom')
    await wrapper.find('[data-testid="invite-create"] form').trigger('submit')
    await flushPromises()
    expect(body(mock.requests.find((r) => r.method === 'POST'))).toEqual({
      role: 'reader',
      expiresInHours: 168,
      note: 'Tom',
    })
    const url = (byTestId('link-url').querySelector('input') as HTMLInputElement).value
    expect(url).toBe(`${window.location.origin}/invite#mdl_inv`)
    // close the dialog and revoke the old invite
    ;[...byTestId('link-result').querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Done'))
      ?.click()
    await flushPromises()
    const old = wrapper
      .findAll('[data-testid="invite-item"]')
      .find((i) => i.text().includes('for Grandma'))
    await old?.find('[data-testid="invite-revoke"]').trigger('click')
    await flushPromises()
    expect(mock.requests.some((r) => r.method === 'DELETE')).toBe(true)
    expect(wrapper.find('[data-testid="invite-list"]').text()).not.toContain('for Grandma')
    wrapper.unmount()
  })

  it('pages through the audit log', async () => {
    const { wrapper, mock } = await mount('audit', {
      'GET /admin/audit/': (request) =>
        new URL(request.url).searchParams.get('before') === '5'
          ? json({
              events: [{ id: 4, time: '', type: 'logout', actor: { id: 'u', username: 'anna' } }],
              next: null,
            })
          : json({
              events: [
                {
                  id: 6,
                  time: '',
                  type: 'login.failed',
                  ip: '10.0.0.1',
                  details: { username: 'mallory' },
                },
                {
                  id: 5,
                  time: '',
                  type: 'account.role-changed',
                  actor: { id: 'u', username: 'anna' },
                  target: { id: 'b', username: 'bob' },
                },
              ],
              next: 5,
            }),
    })
    expect(wrapper.findAll('[data-testid="audit-event"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Sign-in failed')
    expect(wrapper.text()).toContain('mallory')
    expect(wrapper.text()).toContain('Role changed')
    const more = wrapper.findAll('button').find((b) => b.text() === 'Load older')
    await more?.trigger('click')
    await flushPromises()
    expect(mock.requests.at(-1)?.url).toContain('before=5')
    expect(wrapper.findAll('[data-testid="audit-event"]')).toHaveLength(3)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Load older')).toBe(false)
    wrapper.unmount()
  })

  it('switches require2FA', async () => {
    const { wrapper, mock } = await mount('settings', {
      'GET /admin/settings/': () => json({ require2FA: false }),
      'PATCH /admin/settings/': (request) => json(body(request)),
    })
    await wrapper.find('[data-testid="require-2fa"] input').setValue(true)
    await flushPromises()
    expect(body(mock.requests.find((r) => r.method === 'PATCH'))).toEqual({ require2FA: true })
    wrapper.unmount()
  })
})
