import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { mountWithPlugins } from '@/test/mount'

import AccessRequestsAdmin from './AccessRequestsAdmin.vue'

const q = (selector: string) => document.querySelector<HTMLElement>(selector)

function request(overrides = {}) {
  return {
    id: 'r1',
    name: 'Anna',
    message: 'Hi',
    status: 'pending',
    createdAt: '2026-11-05T09:00:00Z',
    expiresAt: '2026-11-12T09:00:00Z',
    documentId: 'd1',
    documentPath: 'Rezepte/Kuchen.md',
    invitedByAccountId: 'a1',
    invitedByName: 'Markus',
    ...overrides,
  }
}

async function open(list: unknown[], extra: Parameters<typeof createFetchMock>[0] = {}) {
  const mock = createFetchMock({
    'GET /admin/access-requests/': () => json(list),
    ...extra,
  })
  setApiClient(new ApiClient({ baseUrl: 'http://backend', fetchFn: mock.fetchFn }))
  const result = await mountWithPlugins(AccessRequestsAdmin)
  await flushPromises()
  return { ...result, mock }
}

describe('AccessRequestsAdmin', () => {
  it('shows who asks, through whom and for what, and warns that the name is a claim', async () => {
    const { wrapper } = await open([request()])
    const item = q('[data-testid="access-request-item"]')!
    expect(item.textContent).toContain('Anna')
    expect(item.textContent).toContain('Markus')
    expect(item.textContent).toContain('Rezepte/Kuchen.md')
    expect(q('[data-testid="access-requests"]')?.textContent).toContain('Anyone can type any name')
    wrapper.unmount()
  })

  it('renders name and message as plain text', async () => {
    const { wrapper } = await open([
      request({ name: '<img src=x onerror=alert(1)>', message: '<b>[link](http://evil)</b>' }),
    ])
    expect(q('[data-testid="access-request-name"]')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    )
    expect(q('[data-testid="access-request-item"] img')).toBeNull()
    expect(q('[data-testid="access-request-item"] b')).toBeNull()
    expect(q('[data-testid="access-request-item"] a')).toBeNull()
    wrapper.unmount()
  })

  it('approves with the chosen role', async () => {
    const { wrapper, mock } = await open([request()], {
      'POST /admin/access-requests/r1/approve/': () =>
        json({
          request: request(),
          invite: { kind: 'invite', role: 'editor' },
          token: 't',
          url: 'u',
        }),
    })
    q('[data-testid="access-request-approve"]')!.click()
    await flushPromises()
    q('[data-testid="access-request-confirm"]')!.click()
    await flushPromises()
    const sent = mock.requests.find((r) => r.url.endsWith('/approve/'))
    expect(JSON.parse(String(sent?.body))).toEqual({ role: 'editor', expiresInHours: 168 })
    wrapper.unmount()
  })
})
