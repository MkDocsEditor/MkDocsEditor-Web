import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { loadRecentSearches, rememberSearch } from '@/sync/recentSearches'
import { signOut } from '@/stores/signOut'
import { wikiCopy } from '@/sync/wikiCopy'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree, user } from '@/test/fixtures'

import { useAuthStore } from './auth'
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
      id === 'd-index' ? json({ message: 'broken' }, 404) : new Response('Text'),
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
    expect(contentRequests()).toBe(all + 1)
    expect(pages.pages.get('d-index')?.text).toBe('Server')
  })

  it('stops after a few server errors in a row, and at once when rate limited', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failing = backend(() => json({ message: 'down' }, 503))
    await useTreeStore().load()
    await usePagesStore().sync()
    expect(failing.contentRequests()).toBe(3)

    setActivePinia(createPinia())
    const limited = backend(() => json({ message: 'slow' }, 429))
    await useTreeStore().load()
    await usePagesStore().sync()
    expect(limited.contentRequests()).toBe(1)
    warn.mockRestore()
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

describe('tree load across a sign-out', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await wikiCopy().clear()
  })

  it('drops a load still running, and stores nothing for the next account', async () => {
    let answer!: (response: Response) => void
    const mock = createFetchMock({
      'GET /section/': () => new Promise<Response>((resolve) => (answer = resolve)),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const auth = useAuthStore()
    auth.signedIn(user({ id: 'a1', username: 'anna' }))
    const tree = useTreeStore()
    const running = tree.load()
    await vi.waitFor(() => expect(answer).toBeDefined())

    tree.reset()
    auth.signedIn(user({ id: 'b2', username: 'ben' }))
    answer(json(sampleTree()))
    await running
    expect(tree.root).toBeNull()
    expect(await wikiCopy().tree()).toBeUndefined()
  })
})

describe('signing out', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await wikiCopy().clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('removes the copy and the search history of this account only', async () => {
    const mock = createFetchMock({
      'GET /section/': () => json(sampleTree()),
      'POST /auth/logout/': () => new Response(null, { status: 204 }),
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const auth = useAuthStore()
    auth.signedIn(user({ id: 'b2', username: 'ben' }))
    await useTreeStore().load()
    const ofBen = wikiCopy()
    await expect.poll(async () => (await ofBen.tree())?.root.id).toBe('root')

    auth.signedIn(user({ id: 'a1', username: 'anna' }))
    await useTreeStore().load()
    const ofAnna = wikiCopy()
    await expect.poll(async () => (await ofAnna.tree())?.root.id).toBe('root')
    rememberSearch('geheim')

    await signOut()
    expect(await ofAnna.tree()).toBeUndefined()
    expect((await ofBen.tree())?.root.id).toBe('root')
    expect(useTreeStore().root).toBeNull()
    auth.signedIn(user({ id: 'a1', username: 'anna' }))
    expect(loadRecentSearches()).toEqual([])
  })
})

describe('stored tree', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await wikiCopy().clear()
  })

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
