import type {
  ActorInfo,
  AuthorshipResponse,
  Credentials,
  DocumentModel,
  ResourceModel,
  SectionModel,
  TokenResponse,
  WhoAmI,
  WsTicket,
} from './types'

/** An error response (or a network failure) of the backend. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, 0 for network errors. */
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

/** Encodes credentials for HTTP Basic auth. Handles non-ASCII characters (UTF-8). */
export function basicAuthHeader({ username, password }: Credentials): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

/** Normalizes the type field: older backends send `Section`, newer ones `section`. */
function normalizeSection(raw: SectionModel): SectionModel {
  return {
    ...raw,
    type: 'section',
    subsections: (raw.subsections ?? []).map(normalizeSection),
    documents: (raw.documents ?? []).map((d) => ({ ...d, type: 'document' })),
    resources: (raw.resources ?? []).map((r) => ({ ...r, type: 'resource' })),
  }
}

export interface ApiClientOptions {
  baseUrl: string
  getCredentials: () => Credentials | null
  fetchFn?: typeof fetch
}

/** Thin REST client for the MkDocsEditor backend. */
export class ApiClient {
  private readonly baseUrl: string
  private readonly getCredentials: () => Credentials | null
  private readonly fetchFn: typeof fetch

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.getCredentials = options.getCredentials
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args))
  }

  /** Absolute URL for a backend path. Paths get a trailing slash like the backend routes. */
  url(path: string): string {
    const [pathname = '', query] = path.split('?', 2)
    const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`
    const absolute = `${this.baseUrl}${withSlash.startsWith('/') ? '' : '/'}${withSlash}`
    return query === undefined ? absolute : `${absolute}?${query}`
  }

  /** Websocket URL for a backend path (http becomes ws, https becomes wss). */
  wsUrl(path: string, params: Record<string, string> = {}): string {
    const url = new URL(this.url(path))
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return url.toString()
  }

  private async request(
    method: string,
    path: string,
    init: { body?: BodyInit; json?: unknown; credentials?: Credentials | null } = {},
  ): Promise<Response> {
    // Without this header the backend sends no WWW-Authenticate on 401, so the browser does not
    // show its own login dialog.
    const headers = new Headers({ 'X-Requested-With': 'XMLHttpRequest' })
    const credentials = init.credentials === undefined ? this.getCredentials() : init.credentials
    if (credentials) headers.set('Authorization', basicAuthHeader(credentials))
    let body = init.body
    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(init.json)
    }

    let response: Response
    try {
      response = await this.fetchFn(this.url(path), { method, headers, body })
    } catch (error) {
      throw new ApiError(
        `Server nicht erreichbar (${error instanceof Error ? error.message : String(error)})`,
        0,
      )
    }
    if (!response.ok) throw new ApiError(await errorMessage(response), response.status)
    return response
  }

  private async json<T>(
    method: string,
    path: string,
    init?: Parameters<ApiClient['request']>[2],
  ): Promise<T> {
    const response = await this.request(method, path, init)
    return (await response.json()) as T
  }

  /** Checks credentials. Falls back to loading the tree on backends without `/auth/whoami/`. */
  async whoami(credentials?: Credentials | null): Promise<WhoAmI> {
    try {
      return await this.json<WhoAmI>('GET', '/auth/whoami', { credentials })
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
        await this.request('GET', '/section', { credentials })
        const used = credentials === undefined ? this.getCredentials() : credentials
        return { username: used?.username ?? '' }
      }
      throw error
    }
  }

  /** Short-lived token for websocket connections (browsers cannot send auth headers there). */
  async token(): Promise<TokenResponse | null> {
    try {
      return await this.json<TokenResponse>('POST', '/auth/token')
    } catch (error) {
      // Backends without token support accept unauthenticated websockets or none at all.
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return null
      throw error
    }
  }

  /** Single-use ticket for the `hello` message of a document websocket. */
  async wsTicket(): Promise<WsTicket> {
    return this.json<WsTicket>('POST', '/auth/ws-ticket')
  }

  async getActors(): Promise<ActorInfo[]> {
    return this.json<ActorInfo[]>('GET', '/actors')
  }

  /** Who wrote which part of a document, or null when the backend does not support it yet. */
  async getAuthorship(id: string): Promise<AuthorshipResponse | null> {
    try {
      return await this.json<AuthorshipResponse>(
        'GET',
        `/document/${encodeURIComponent(id)}/authorship`,
      )
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return null
      throw error
    }
  }

  async getTree(): Promise<SectionModel> {
    return normalizeSection(await this.json<SectionModel>('GET', '/section'))
  }

  async createSection(parentId: string, name: string): Promise<SectionModel> {
    return normalizeSection(
      await this.json<SectionModel>('POST', '/section', { json: { parent: parentId, name } }),
    )
  }

  async renameSection(id: string, name: string): Promise<SectionModel> {
    return normalizeSection(
      await this.json<SectionModel>('PUT', `/section/${encodeURIComponent(id)}`, {
        json: { name },
      }),
    )
  }

  async deleteSection(id: string, force = false): Promise<void> {
    await this.request('DELETE', `/section/${encodeURIComponent(id)}${force ? '?force=true' : ''}`)
  }

  async getDocument(id: string): Promise<DocumentModel> {
    return this.json<DocumentModel>('GET', `/document/${encodeURIComponent(id)}`)
  }

  async getDocumentContent(id: string): Promise<string> {
    const response = await this.request('GET', `/document/${encodeURIComponent(id)}/content`)
    return response.text()
  }

  async createDocument(parentId: string, name: string): Promise<DocumentModel> {
    return this.json<DocumentModel>('POST', '/document', { json: { parent: parentId, name } })
  }

  async renameDocument(id: string, name: string): Promise<DocumentModel> {
    return this.json<DocumentModel>('PUT', `/document/${encodeURIComponent(id)}`, {
      json: { name },
    })
  }

  /** `force` deletes even while someone has the document open (otherwise 409). */
  async deleteDocument(id: string, force = false): Promise<void> {
    await this.request('DELETE', `/document/${encodeURIComponent(id)}${force ? '?force=true' : ''}`)
  }

  /** Downloads a resource with auth (for previews of images that need credentials). */
  async getResourceContent(id: string): Promise<Blob> {
    const response = await this.request('GET', `/resource/${encodeURIComponent(id)}/content`)
    return response.blob()
  }

  async uploadResource(parentId: string, name: string, file: Blob): Promise<ResourceModel> {
    const form = new FormData()
    form.append('file', file, name)
    return this.json<ResourceModel>(
      'POST',
      `/resource/${encodeURIComponent(parentId)}/${encodeURIComponent(name)}`,
      { body: form },
    )
  }

  async renameResource(id: string, name: string): Promise<ResourceModel> {
    return this.json<ResourceModel>('PUT', `/resource/${encodeURIComponent(id)}`, {
      json: { name },
    })
  }

  async deleteResource(id: string): Promise<void> {
    await this.request('DELETE', `/resource/${encodeURIComponent(id)}`)
  }
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim()
  try {
    const text = await response.text()
    try {
      const body = JSON.parse(text) as { message?: unknown }
      if (typeof body.message === 'string' && body.message !== '') return body.message
    } catch {
      // not JSON
    }
    return text.trim() !== '' ? text.trim() : fallback
  } catch {
    return fallback
  }
}
