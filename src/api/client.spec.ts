import { describe, expect, it } from 'vitest'

import { createFetchMock, json } from '@/test/fetchMock'

import { ApiClient, ApiError, basicAuthHeader } from './client'

const credentials = { username: 'anna', password: 'Grüße!' }

function client(routes: Parameters<typeof createFetchMock>[0], creds = credentials) {
  const mock = createFetchMock(routes)
  const api = new ApiClient({
    baseUrl: 'http://backend:7413/',
    getCredentials: () => creds,
    fetchFn: mock.fetchFn,
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

describe('basicAuthHeader', () => {
  it('encodes UTF-8 credentials', () => {
    expect(basicAuthHeader({ username: 'a', password: 'b' })).toBe('Basic YTpi')
    const decoded = atob(basicAuthHeader(credentials).slice(6))
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('anna:Grüße!')
  })
})

describe('ApiClient', () => {
  it('builds URLs with trailing slashes and websocket URLs', () => {
    const { api } = client({})
    expect(api.url('/section')).toBe('http://backend:7413/section/')
    expect(api.wsUrl('/document/d1/ws', { token: 't' })).toBe(
      'ws://backend:7413/document/d1/ws/?token=t',
    )
    const secure = new ApiClient({ baseUrl: 'https://x.example', getCredentials: () => null })
    expect(secure.wsUrl('/events/ws')).toBe('wss://x.example/events/ws/')
  })

  it('loads and normalizes the tree with basic auth', async () => {
    const { api, requests } = client({ 'GET /section/': () => json(tree) })
    const root = await api.getTree()
    expect(root.type).toBe('section')
    expect(root.subsections[0]?.type).toBe('section')
    expect(root.subsections[0]?.subsections).toEqual([])
    expect(root.documents[0]?.type).toBe('document')
    expect(requests[0]?.headers.get('Authorization')).toBe(basicAuthHeader(credentials))
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
      getCredentials: () => null,
      fetchFn: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    const error = (await api.getTree().catch((e: unknown) => e)) as ApiError
    expect(error.isNetworkError).toBe(true)
  })

  it('whoami uses the given credentials and falls back to the tree on old backends', async () => {
    const { api, requests } = client({ 'GET /section/': () => json(tree) })
    const who = await api.whoami({ username: 'ben', password: 'x' })
    expect(who.username).toBe('ben')
    expect(requests.map((r) => r.url)).toEqual([
      'http://backend:7413/auth/whoami/',
      'http://backend:7413/section/',
    ])
    expect(requests[1]?.headers.get('Authorization')).toBe(
      basicAuthHeader({ username: 'ben', password: 'x' }),
    )
  })

  it('whoami without credentials sends no auth header', async () => {
    const { api, requests } = client({ 'GET /auth/whoami/': () => json({ username: '' }) })
    await api.whoami(null)
    expect(requests[0]?.headers.has('Authorization')).toBe(false)
  })

  it('token returns null when the backend has no token endpoint', async () => {
    const { api } = client({})
    expect(await api.token()).toBeNull()
    const { api: api2 } = client({ 'POST /auth/token/': () => json({ token: 'abc' }) })
    expect(await api2.token()).toEqual({ token: 'abc' })
  })
})
