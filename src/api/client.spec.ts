import { describe, expect, it } from 'vitest'

import { createFetchMock, json } from '@/test/fetchMock'

import { ApiClient, ApiError } from './client'

function client(routes: Parameters<typeof createFetchMock>[0], onSessionEnded?: () => void) {
  const mock = createFetchMock(routes)
  const api = new ApiClient({
    baseUrl: 'http://backend:7413/',
    fetchFn: mock.fetchFn,
    onSessionEnded,
  })
  return { api, ...mock }
}

const tree = {
  type: 'Section',
  id: 'root',
  name: 'docs',
  subsections: [
    { type: 'Section', id: 's1', name: 'Rezepte', subsections: null, documents: [], resources: [] },
  ],
  documents: [{ type: 'Document', id: 'd1', name: 'index', filesize: 3, modtime: '', url: '' }],
  resources: [],
}

describe('ApiClient', () => {
  it('builds URLs with trailing slashes and websocket URLs', () => {
    const { api } = client({})
    expect(api.url('/section')).toBe('http://backend:7413/section/')
    expect(api.wsUrl('/document/d1/ws', { token: 't' })).toBe(
      'ws://backend:7413/document/d1/ws/?token=t',
    )
    const secure = new ApiClient({ baseUrl: 'https://x.example' })
    expect(secure.wsUrl('/events/ws')).toBe('wss://x.example/events/ws/')
  })

  it('loads and normalizes the tree with the session cookie', async () => {
    const { api, requests } = client({ 'GET /section/': () => json(tree) })
    const root = await api.getTree()
    expect(root.type).toBe('section')
    expect(root.subsections[0]?.type).toBe('section')
    expect(root.subsections[0]?.subsections).toEqual([])
    expect(root.documents[0]?.type).toBe('document')
    expect(requests[0]?.credentials).toBe('include')
    expect(requests[0]?.headers.has('Authorization')).toBe(false)
  })

  it('sends JSON bodies for create and rename', async () => {
    const { api, requests } = client({
      'POST /document/': () => json({ type: 'document', id: 'd2', name: 'neu' }),
      'PUT /section/s1/': () => json({ ...tree.subsections[0], name: 'Kochen' }),
    })
    await api.createDocument('root', 'neu')
    await api.renameSection('s1', 'Kochen')
    expect(JSON.parse(requests[0]?.body as string)).toEqual({ parent: 'root', name: 'neu' })
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(requests[1]?.body as string)).toEqual({ name: 'Kochen' })
  })

  it('uploads resources as multipart form data', async () => {
    const { api, requests } = client({
      'POST /resource/root/bild%201.png/': () => json({ type: 'resource', id: 'r1' }),
    })
    await api.uploadResource('root', 'bild 1.png', new Blob(['png']))
    const body = requests[0]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBeInstanceOf(Blob)
  })

  it('turns error responses into ApiErrors with the backend message', async () => {
    const { api } = client({
      'DELETE /document/d1/': () => json({ name: 'Conflict', message: 'still open' }, 409),
      'GET /section/': () => new Response('nope', { status: 401 }),
    })
    await expect(api.deleteDocument('d1')).rejects.toMatchObject({
      status: 409,
      message: 'still open',
    })
    const error = await api.getTree().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isUnauthorized).toBe(true)
  })

  it('reports network failures with status 0', async () => {
    const api = new ApiClient({
      baseUrl: 'http://backend',
      fetchFn: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    const error = (await api.getTree().catch((e: unknown) => e)) as ApiError
    expect(error.isNetworkError).toBe(true)
  })

  it('reports an ended session once, but not for quiet requests', async () => {
    let ended = 0
    const { api } = client(
      {
        'GET /section/': () => json({ code: 'unauthenticated', message: 'no session' }, 401),
        'GET /auth/whoami/': () => json({ code: 'unauthenticated', message: 'no session' }, 401),
        'POST /auth/login/': () =>
          json({ code: 'invalid-credentials', message: 'invalid username or password' }, 401),
      },
      () => ended++,
    )
    await expect(api.getTree()).rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
    expect(ended).toBe(1)
    await expect(api.whoami({ quiet401: true })).rejects.toMatchObject({ status: 401 })
    expect(ended).toBe(1)
    // a wrong password is not an ended session
    await expect(api.json('POST', '/auth/login', { json: {} })).rejects.toMatchObject({
      code: 'invalid-credentials',
      isSessionEnded: false,
    })
    expect(ended).toBe(1)
  })

  it('reads error codes, details and Retry-After', async () => {
    const { api } = client({
      'POST /auth/login/': () =>
        new Response(
          JSON.stringify({
            code: 'rate-limited',
            message: 'slow down',
            details: { retryAfter: 7 },
          }),
          { status: 429, headers: { 'Retry-After': '12' } },
        ),
      'POST /auth/link/redeem/': () =>
        json({ code: 'weak-password', message: 'weak', details: { reason: 'common' } }, 400),
    })
    const limited = (await api.json('POST', '/auth/login').catch((e: unknown) => e)) as ApiError
    expect(limited.isRateLimited).toBe(true)
    expect(limited.retryAfter).toBe(12)
    expect(limited.message).toBe('slow down')
    const weak = (await api.json('POST', '/auth/link/redeem').catch((e: unknown) => e)) as ApiError
    expect(weak.code).toBe('weak-password')
    expect(weak.details).toEqual({ reason: 'common' })
  })

  it('returns undefined for 204 responses', async () => {
    const { api } = client({ 'POST /auth/logout/': () => new Response(null, { status: 204 }) })
    expect(await api.json('POST', '/auth/logout')).toBeUndefined()
  })
})

describe('ApiClient protocol v1 endpoints', () => {
  it('sends X-Requested-With so browsers show no auth dialog', async () => {
    const { api, requests } = client({ 'GET /section/': () => json(tree) })
    await api.getTree()
    expect(requests[0]?.headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  it('gets websocket tickets, actors and authorship', async () => {
    const { api, requests } = client({
      'POST /auth/ws-ticket/': () => json({ ticket: 't1', expiresAt: 'x' }),
      'GET /actors/': () => json([{ actorId: 'a', username: 'anna' }]),
      'GET /document/d1/authorship/': () => json({ heads: [], runs: [] }),
    })
    expect((await api.wsTicket()).ticket).toBe('t1')
    expect(await api.getActors()).toHaveLength(1)
    expect(await api.getAuthorship('d1')).toEqual({ heads: [], runs: [] })
    expect(await api.getAuthorship('d2')).toBeNull()
    expect(requests[0]?.method).toBe('POST')
  })

  it('keeps query strings when adding the trailing slash', async () => {
    const { api, requests } = client({ 'DELETE /document/d1/': () => new Response(null) })
    await api.deleteDocument('d1', true)
    expect(requests[0]?.url).toBe('http://backend:7413/document/d1/?force=true')
  })

  it('reads the history and treats 404 as "no history"', async () => {
    const entry = {
      revision: 'abc1234',
      time: '2026-10-31T12:00:00Z',
      author: { name: 'Anna', email: 'a@x', username: 'anna' },
      coAuthors: [],
      message: 'Update a.md',
      path: 'a.md',
    }
    const { api, requests } = client({
      'GET /document/d1/history/': () => json([entry]),
      'GET /document/d1/history/abc1234/content/': () => new Response('alt'),
      'GET /document/d1/history/diff/': () => new Response('@@ -1 +1 @@'),
      'POST /document/d1/history/abc1234/restore/': () => new Response(null, { status: 204 }),
    })
    expect(await api.getHistory('d1')).toEqual([entry])
    expect(requests[0]!.url).toBe('http://backend:7413/document/d1/history/?limit=100')
    expect(await api.getRevisionContent('d1', 'abc1234')).toBe('alt')
    expect(await api.getRevisionDiff('d1', 'abc1234')).toBe('@@ -1 +1 @@')
    expect(requests[2]!.url).toBe(
      'http://backend:7413/document/d1/history/diff/?from=abc1234&to=current',
    )
    await api.restoreRevision('d1', 'abc1234')
    expect(requests[3]!.method).toBe('POST')
    expect(await api.getHistory('d2')).toBeNull()
  })
})
