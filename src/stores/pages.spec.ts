import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { wikiCopy } from '@/sync/wikiCopy'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'

import { usePagesStore } from './pages'
import { useTreeStore } from './tree'

function backend(content: (id: string) => Response) {
  const tree = sampleTree()
  const routes: Parameters<typeof createFetchMock>[0] = { 'GET /section/': () => json(tree) }
  const walk = (section: typeof tree): void => {
    for (const d of section.documents) {
      d.modtime = '2026-01-01T00:00:00Z'
      routes[`GET /document/${d.id}/content/`] = () => content(d.id)
    }
    section.subsections.forEach(walk)
  }
  walk(tree)
  const mock = createFetchMock(routes)
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const contentRequests = () => mock.requests.filter((r) => r.url.includes('/content/')).length
  return { tree, contentRequests, walk }
}

describe('pages store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await wikiCopy().clear()
  })
  afterEach(() => setApiClient(null))

  it('fetches every page once, and only changed ones afterwards', async () => {
    const { tree, contentRequests } = backend((id) => new Response(`Text von ${id}`))
    const treeStore = useTreeStore()
    await treeStore.load()
    const pages = usePagesStore()
    await pages.sync()
    const all = contentRequests()
    expect(all).toBeGreaterThan(1)
    expect(pages.pages.get('d-index')?.text).toBe('Text von d-index')
    expect(pages.progress).toBeNull()

    tree.documents[0]!.modtime = '2026-02-02T00:00:00Z'
    await treeStore.load()
    await pages.sync()
    expect(contentRequests()).toBe(all + 1)
  })

  it('finds what is stored after a reload, and drops pages that are gone', async () => {
    const { tree } = backend(() => new Response('Text'))
    await useTreeStore().load()
    await usePagesStore().sync()

    setActivePinia(createPinia())
    tree.documents.splice(0, 1)
    await useTreeStore().load()
    const pages = usePagesStore()
    await pages.sync()
    expect(pages.pages.has('d-index')).toBe(false)
    expect((await wikiCopy().pages()).has('d-index')).toBe(false)
    expect(pages.pages.size).toBeGreaterThan(0)
  })

  it('stops at a connection failure but skips a single page that fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { contentRequests } = backend((id) =>
      id === 'd-index' ? json({ message: 'broken' }, 500) : new Response('Text'),
    )
    await useTreeStore().load()
    const pages = usePagesStore()
    await pages.sync()
    expect(pages.pages.has('d-index')).toBe(false)
    expect(pages.pages.size).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()

    await wikiCopy().clear()
    setActivePinia(createPinia())
    const treeOnly = createFetchMock({ 'GET /section/': () => json(sampleTree()) })
    let failing = false
    const client = new ApiClient({
      baseUrl: 'http://b',
      fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (failing) throw new TypeError('Failed to fetch')
        return treeOnly.fetchFn(input, init)
      }) as typeof fetch,
    })
    setApiClient(client)
    await useTreeStore().load()
    failing = true
    const before = treeOnly.requests.length
    const next = usePagesStore()
    await next.sync()
    expect(treeOnly.requests.length).toBe(before)
    expect(next.pages.size).toBe(0)
    expect(contentRequests()).toBeGreaterThan(0)
  })

  it('keeps an edit but fetches the page again next time', async () => {
    const { contentRequests } = backend(() => new Response('Server'))
    await useTreeStore().load()
    const pages = usePagesStore()
    await pages.sync()
    const all = contentRequests()
    pages.edited('d-index', 'Lokal')
    expect(pages.pages.get('d-index')?.text).toBe('Lokal')
    await pages.sync()
    expect(contentRequests()).toBe(all)
  })

  it('does not store anything for the next account after a reset', async () => {
    let release!: (response: Response) => void
    backend((id) =>
      id === 'd-index'
        ? (new Promise<Response>((resolve) => (release = resolve)) as unknown as Response)
        : new Response('Text'),
    )
    await useTreeStore().load()
    const pages = usePagesStore()
    const running = pages.sync()
    await vi.waitFor(() => expect(release).toBeDefined())
    pages.reset()
    release(new Response('Alt'))
    await running
    expect(pages.pages.size).toBe(0)
    expect((await wikiCopy().pages()).size).toBe(0)
  })
})

describe('stored tree', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await wikiCopy().clear()
  })
  afterEach(() => setApiClient(null))

  it('takes over when the server cannot be reached, but not when it refuses', async () => {
    let answer: () => Response = () => json(sampleTree())
    const mock = createFetchMock({ 'GET /section/': () => answer() })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const first = useTreeStore()
    await first.load()
    const syncedAt = first.lastSync

    setActivePinia(createPinia())
    answer = () => json({ message: 'no' }, 403)
    const refused = useTreeStore()
    await expect(refused.load()).rejects.toThrow()
    expect(refused.root).toBeNull()

    setActivePinia(createPinia())
    answer = () => json({ message: 'down' }, 503)
    const offline = useTreeStore()
    await expect(offline.load()).rejects.toThrow()
    expect(offline.root?.id).toBe('root')
    expect(offline.lastSync).toBe(syncedAt)
    expect(offline.error).not.toBeNull()
  })
})
