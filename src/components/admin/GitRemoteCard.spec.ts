import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import type { GitRemoteStatus } from '@/api'
import { useNotifyStore } from '@/stores/notify'
import { createFetchMock, json } from '@/test/fetchMock'
import { mountWithPlugins } from '@/test/mount'

import GitRemoteCard from './GitRemoteCard.vue'

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

function status(overrides: Partial<GitRemoteStatus> = {}): GitRemoteStatus {
  return {
    state: 'connected',
    pushEnabled: true,
    provider: 'forgejo',
    providerName: 'Forgejo',
    providerUrl: 'https://git.example.org',
    grantsUrl: 'https://git.example.org/user/settings/applications',
    scopedGrants: false,
    repo: 'markus/Wiki',
    expectedUser: 'mkdocseditor',
    allowAdmin: false,
    remoteUser: { login: 'mkdocseditor', avatarUrl: null, isAdmin: false },
    canPush: true,
    connectedAt: '2026-11-01T10:00:00Z',
    connectedBy: 'markus',
    lastRefreshAt: new Date().toISOString(),
    refreshExpiresAt: new Date(Date.now() + 29 * 86_400_000).toISOString(),
    lastRefreshError: null,
    lastPushAt: null,
    lastPushError: null,
    pendingCommits: 0,
    ...overrides,
  }
}

function disconnected(overrides: Partial<GitRemoteStatus> = {}): GitRemoteStatus {
  return status({
    state: 'disconnected',
    remoteUser: null,
    canPush: null,
    connectedAt: null,
    connectedBy: null,
    lastRefreshAt: null,
    refreshExpiresAt: null,
    ...overrides,
  })
}

async function open(
  current: GitRemoteStatus | (() => Response),
  extra: Parameters<typeof createFetchMock>[0] = {},
  path = '/settings/server',
) {
  const mock = createFetchMock({
    'GET /admin/git-remote/': typeof current === 'function' ? current : () => json(current),
    ...extra,
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  const result = await mountWithPlugins(GitRemoteCard, { initialPath: path })
  await flushPromises()
  return { ...result, mock }
}

describe('GitRemoteCard', () => {
  let assign: ReturnType<typeof vi.fn>
  beforeEach(() => {
    assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, origin: window.location.origin })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stays hidden on a server without the endpoint', async () => {
    const { wrapper } = await open(() => json({ message: 'no route' }, 404))
    expect(q('git-remote')).toBeNull()
    wrapper.unmount()
  })

  it('says how to set it up when the server has no provider', async () => {
    const { wrapper } = await open(
      disconnected({
        state: 'not-configured',
        provider: null,
        providerName: null,
        providerUrl: null,
        grantsUrl: null,
        repo: null,
        expectedUser: null,
      }),
    )
    expect(q('git-remote')?.textContent).toContain('Pushing changes')
    expect(q('git-remote-not-configured')?.textContent).toContain('git.oauth')
    expect(q('git-remote-connect')).toBeNull()
    wrapper.unmount()
  })

  it('connects: asks for the authorize URL and goes there', async () => {
    const { wrapper, mock } = await open(disconnected({ pushEnabled: false }), {
      'POST /admin/git-remote/connect/': () =>
        json({ authorizeUrl: 'https://git.example.org/login/oauth/authorize?state=s' }),
    })
    expect(q('git-remote')?.textContent).toContain('Pushing to Forgejo')
    expect(q('git-remote-push-off')?.textContent).toContain('git.push')
    expect(q('git-remote-hint')?.textContent).toContain('If that is not mkdocseditor')
    expect(q('git-remote-hint')?.textContent).toContain('git.example.org')
    q('git-remote-connect')!.click()
    await flushPromises()
    expect(mock.requests.some((r) => r.method === 'POST')).toBe(true)
    expect(assign).toHaveBeenCalledWith('https://git.example.org/login/oauth/authorize?state=s')
    wrapper.unmount()
  })

  it('does not follow an authorize URL that is no web address', async () => {
    const { wrapper } = await open(disconnected(), {
      'POST /admin/git-remote/connect/': () => json({ authorizeUrl: 'javascript:alert(1)' }),
    })
    q('git-remote-connect')!.click()
    await flushPromises()
    expect(assign).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('explains a push remote that does not fit the provider', async () => {
    const { wrapper } = await open(disconnected(), {
      'POST /admin/git-remote/connect/': () => json({ code: 'conflict', message: 'x' }, 409),
    })
    q('git-remote-connect')!.click()
    await flushPromises()
    expect(useNotifyStore().queue.at(-1)?.text).toContain('no https address on git.example.org')
    wrapper.unmount()
  })

  it('shows the connection with its warnings', async () => {
    const { wrapper } = await open(
      status({
        remoteUser: { login: 'markus', avatarUrl: null, isAdmin: true },
        canPush: false,
        refreshExpiresAt: new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString(),
        lastRefreshError: { at: new Date().toISOString(), message: 'timeout', permanent: false },
        lastPushError: { at: new Date().toISOString(), message: 'rejected' },
        pendingCommits: 2,
      }),
    )
    expect(q('git-remote-details')?.textContent).toContain('markus')
    expect(q('git-remote-admin')?.textContent).toContain('Forgejo grants no narrower access')
    expect(q('git-remote-cannot-push')?.textContent).toContain('markus/Wiki')
    expect(q('git-remote-expires')?.textContent).toContain('in 3 days')
    expect(q('git-remote-refresh-error')?.textContent).toContain('timeout')
    expect(q('git-remote-push-error')?.textContent).toContain('rejected')
    expect(q('git-remote-pending')?.textContent).toContain('2 changes waiting')
    expect(q('git-remote-connect')).toBeNull()
    wrapper.unmount()
  })

  it('shows no push warning while the check failed', async () => {
    const { wrapper } = await open(status({ canPush: null }))
    expect(q('git-remote-details')).not.toBeNull()
    expect(q('git-remote-cannot-push')).toBeNull()
    wrapper.unmount()
  })

  it('offers to connect again once the connection ended', async () => {
    const { wrapper } = await open(
      status({
        state: 'expired',
        lastRefreshError: {
          at: new Date().toISOString(),
          message: 'invalid_grant',
          permanent: true,
        },
      }),
    )
    expect(q('git-remote-expired')).not.toBeNull()
    expect(q('git-remote-refresh-error')).toBeNull()
    expect(q('git-remote-connect')?.textContent).toContain('Connect again')
    expect(q('git-remote-disconnect')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows a refused attempt from the callback and removes it from the address', async () => {
    const { wrapper, router } = await open(
      disconnected(),
      {},
      '/settings/server?git-remote=error&reason=wrong-user&login=markus',
    )
    const alert = q('git-remote-failed')
    expect(alert?.textContent).toContain(
      'markus approved, but the server only accepts mkdocseditor',
    )
    expect(alert?.querySelector('a')?.getAttribute('href')).toBe(
      'https://git.example.org/user/settings/applications',
    )
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/server'))
    wrapper.unmount()
  })

  it('reports a successful connection from the callback', async () => {
    const { wrapper, router } = await open(status(), {}, '/settings/server?git-remote=connected')
    expect(useNotifyStore().queue.at(-1)).toMatchObject({
      text: 'Connected to Forgejo',
      color: 'success',
    })
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings/server'))
    wrapper.unmount()
  })

  it('disconnects after the confirmation', async () => {
    const { wrapper, mock } = await open(status(), {
      'DELETE /admin/git-remote/': () => json(disconnected()),
    })
    q('git-remote-disconnect')!.click()
    await flushPromises()
    q('confirm-button')!.click()
    await flushPromises()
    expect(mock.requests.some((r) => r.method === 'DELETE')).toBe(true)
    expect(useNotifyStore().queue.at(-1)?.text).toContain('Remove the app in Forgejo too')
    expect(q('git-remote-disconnected')).not.toBeNull()
    wrapper.unmount()
  })
})
