import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { mountWithPlugins } from '@/test/mount'

import HistoryDialog from './HistoryDialog.vue'

const revisions = [
  {
    revision: 'bbbbbbb',
    time: '2026-10-31T12:00:00Z',
    author: { name: 'Opa Hans', email: '', username: '' },
    coAuthors: [],
    message: 'Zweite Fassung',
    path: 'a.md',
  },
  {
    revision: 'aaaaaaa',
    time: '2026-10-30T12:00:00Z',
    author: { name: 'Oma Erna', email: '', username: '' },
    coAuthors: [{ name: 'Anna', email: '', username: 'anna' }],
    message: 'Erste Fassung\n\nCo-authored-by: Anna <a@x>',
    path: 'a.md',
  },
]

async function setup(routes: Parameters<typeof createFetchMock>[0], readOnly = false) {
  const mock = createFetchMock(routes)
  setApiClient(
    new ApiClient({ baseUrl: 'http://b', getCredentials: () => null, fetchFn: mock.fetchFn }),
  )
  const open = ref(false)
  const Host = defineComponent({
    setup: () => () =>
      h(HistoryDialog, {
        documentId: 'd1',
        readOnly,
        modelValue: open.value,
        'onUpdate:modelValue': (v: boolean) => (open.value = v),
      }),
  })
  const result = await mountWithPlugins(Host)
  open.value = true
  await flushPromises()
  await flushPromises()
  return { ...result, ...mock, open }
}

const q = (selector: string) => document.querySelector(selector)
const qa = (selector: string) => [...document.querySelectorAll(selector)]

describe('HistoryDialog', () => {
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('lists versions, shows what one changed and restores it', async () => {
    const { wrapper, requests, open } = await setup({
      'GET /document/d1/history/': () => json(revisions),
      'GET /document/d1/history/diff/': () => new Response('@@ -1 +1 @@\n-alt\n+neu\n'),
      'GET /document/d1/history/aaaaaaa/content/': () => new Response('erste'),
      'POST /document/d1/history/aaaaaaa/restore/': () => new Response(null, { status: 204 }),
    })
    const entries = qa('[data-testid="history-entry"]')
    expect(entries).toHaveLength(2)
    expect(entries[1]!.textContent).toContain('Oma Erna and 1 more')
    expect(entries[1]!.textContent).not.toContain('Co-authored-by')
    // the newest is the current state and cannot be restored
    ;(entries[0] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-detail"]')).not.toBeNull()
    expect(q('[data-testid="history-restore"]')).toBeNull()
    // back to the list (on narrow screens list and detail take turns)
    ;(q('[aria-label="Back to the list"]') as HTMLElement).click()
    await flushPromises()

    ;(entries[1] as HTMLElement).click()
    await flushPromises()
    // the oldest has no predecessor: its text is shown
    expect(q('[data-testid="history-content"]')?.textContent).toBe('erste')
    ;(q('[data-testid="history-restore"]') as HTMLElement).click()
    await flushPromises()
    ;(q('[data-testid="confirm-button"]') as HTMLElement).click()
    await flushPromises()
    expect(requests.some((r) => r.method === 'POST' && r.url.includes('/aaaaaaa/restore/'))).toBe(
      true,
    )
    expect(open.value).toBe(false)
    wrapper.unmount()
  })

  it('shows the diff of a version against its predecessor', async () => {
    const { wrapper, requests } = await setup({
      'GET /document/d1/history/': () => json(revisions),
      'GET /document/d1/history/diff/': () => new Response('@@ -1 +1 @@\n-alt\n+neu\n'),
    })
    ;(qa('[data-testid="history-entry"]')[0] as HTMLElement).click()
    await flushPromises()
    expect(qa('.history__line--del').map((l) => l.textContent)).toEqual(['−alt'])
    expect(qa('.history__line--add').map((l) => l.textContent)).toEqual(['+neu'])
    expect(requests.find((r) => r.url.includes('/diff/'))?.url).toContain('from=aaaaaaa&to=bbbbbbb')
    wrapper.unmount()
  })

  it('explains when the server has no history', async () => {
    const { wrapper } = await setup({})
    expect(document.body.textContent).toContain('No version history')
    wrapper.unmount()
  })

  it('offers no restore to readers', async () => {
    const { wrapper } = await setup(
      {
        'GET /document/d1/history/': () => json(revisions),
        'GET /document/d1/history/aaaaaaa/content/': () => new Response('erste'),
      },
      true,
    )
    ;(qa('[data-testid="history-entry"]')[1] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-restore"]')).toBeNull()
    wrapper.unmount()
  })
})
