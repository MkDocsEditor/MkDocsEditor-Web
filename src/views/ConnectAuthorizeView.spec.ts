import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import type { OAuthRequest } from '@/api'
import ReauthDialog from '@/components/auth/ReauthDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import type { RecordedRequest } from '@/test/fetchMock'
import { authStatus, user } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import ConnectAuthorizeView from './ConnectAuthorizeView.vue'

type Routes = Parameters<typeof createFetchMock>[0]

const REQUEST: OAuthRequest = {
  id: 'r1',
  clientId: 'c1',
  clientName: 'Claude Code',
  redirectUri: 'http://localhost:54321/callback',
  scope: 'write',
  allowedScopes: ['read', 'write'],
  resource: 'https://wiki.example.com/api/mcp',
  expiresAt: '2099-01-01T00:00:00Z',
}

const CODE_URL = 'http://localhost:54321/callback?code=abc&state=s'

function body(request: RecordedRequest | undefined): unknown {
  return request?.body ? JSON.parse(String(request.body)) : undefined
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

async function mount(routes: Routes, request = 'r1') {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign, origin: window.location.origin })
  const mock = createFetchMock({ 'GET /auth/status/': () => json(authStatus()), ...routes })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  const Page = defineComponent({
    render: () => [h(ConnectAuthorizeView, { request }), h(ReauthDialog)],
  })
  const result = await mountWithPlugins(Page)
  useAuthStore().signedIn(user())
  await flushPromises()
  return { ...result, mock, assign }
}

describe('ConnectAuthorizeView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows who asks for what and where the answer goes, then allows after a step-up', async () => {
    let reauthenticated = false
    const { wrapper, mock, assign } = await mount({
      'GET /oauth/requests/r1/': () => json(REQUEST),
      'POST /oauth/requests/r1/approve/': () =>
        reauthenticated
          ? json({ redirectUrl: CODE_URL })
          : json({ code: 'reauth-required', message: 'reauth' }, 403),
      'POST /auth/reauth/': () => {
        reauthenticated = true
        return json({ reauthenticatedUntil: '' })
      },
    })
    expect(byTestId('oauth-client')?.textContent).toContain('calls itself Claude Code')
    expect(byTestId('oauth-client')?.textContent).toContain('read and edit')
    expect(byTestId('oauth-target-host')?.textContent).toBe('localhost:54321')
    expect(byTestId('oauth-target')?.textContent).toContain('An app on this computer')
    expect(byTestId('oauth-remote')).toBeNull()

    byTestId('oauth-approve')!.click()
    await flushPromises()
    const input = byTestId('reauth-password')!.querySelector('input')!
    input.value = 'my password!'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    byTestId('reauth-confirm')!.click()
    await flushPromises()

    const approvals = mock.requests.filter((r) => r.url.endsWith('/approve/'))
    expect(body(approvals.at(-1))).toEqual({ scope: 'write' })
    expect(assign).toHaveBeenCalledWith(CODE_URL)
    expect(byTestId('oauth-decided')?.textContent).toContain('Go back to Claude Code')
    wrapper.unmount()
  })

  it('allows less than asked for', async () => {
    const { wrapper, mock, assign } = await mount({
      'GET /oauth/requests/r1/': () => json(REQUEST),
      'POST /oauth/requests/r1/approve/': () => json({ redirectUrl: CODE_URL }),
    })
    const readOnly =
      byTestId('oauth-scope')!.querySelector<HTMLInputElement>('input[value="read"]')!
    readOnly.click()
    await flushPromises()
    expect(byTestId('oauth-client')?.textContent).toContain('wants to read the wiki')
    byTestId('oauth-approve')!.click()
    await flushPromises()
    expect(body(mock.requests.find((r) => r.url.endsWith('/approve/')))).toEqual({ scope: 'read' })
    expect(assign).toHaveBeenCalledWith(CODE_URL)
    wrapper.unmount()
  })

  it('refuses and sends the browser back with the refusal', async () => {
    const denied = 'http://localhost:54321/callback?error=access_denied&state=s'
    const { wrapper, assign } = await mount({
      'GET /oauth/requests/r1/': () => json(REQUEST),
      'POST /oauth/requests/r1/deny/': () => json({ redirectUrl: denied }),
    })
    byTestId('oauth-deny')!.click()
    await flushPromises()
    expect(assign).toHaveBeenCalledWith(denied)
    expect(byTestId('oauth-decided')?.textContent).toContain('Refused')
    wrapper.unmount()
  })

  it('warns about an answer that leaves this computer, and offers readers only reading', async () => {
    const { wrapper } = await mount({
      'GET /oauth/requests/r1/': () =>
        json({
          ...REQUEST,
          redirectUri: 'https://claude.ai/api/mcp/auth_callback',
          allowedScopes: ['read'],
        }),
    })
    expect(byTestId('oauth-target-host')?.textContent).toBe('claude.ai')
    expect(byTestId('oauth-remote')?.textContent).toContain('not on this computer')
    expect(byTestId('oauth-scope')).toBeNull()
    expect(byTestId('oauth-read-only')?.textContent).toContain('your role cannot edit')
    wrapper.unmount()
  })

  it('explains an expired, answered or missing request', async () => {
    const gone = await mount({
      'GET /oauth/requests/r1/': () => json({ code: 'not-found', message: 'x' }, 404),
    })
    expect(byTestId('oauth-error')?.textContent).toContain('no longer valid')
    gone.wrapper.unmount()
    const missing = await mount({}, '')
    expect(byTestId('oauth-error')?.textContent).toContain('no longer valid')
    expect(missing.mock.requests.some((r) => r.url.includes('/oauth/'))).toBe(false)
    missing.wrapper.unmount()
  })
})
