import type {
  ActorInfo,
  AuthorshipResponse,
  Backlink,
  BrokenReference,
  DocumentModel,
  FeedPage,
  ItemRef,
  ItemType,
  MovedTo,
  MoveRequest,
  MoveResult,
  PinScope,
  Pins,
  ResourceModel,
  Revision,
  SectionModel,
  WhoAmI,
  WsTicket,
} from './types'

/** Builds a backend path; every interpolated value is URL encoded. */
export function urlPath(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return String.raw({ raw: strings }, ...values.map((v) => encodeURIComponent(v)))
}

const forceQuery = (force: boolean) => (force ? '?force=true' : '')

/** An error response (or a network failure) of the backend. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, 0 for network errors. */
    readonly status: number,
    /** Machine readable error code of the backend (`docs/auth.md` section 10), or ''. */
    readonly code = '',
    readonly details: Record<string, unknown> = {},
    /** Seconds to wait, for 429 responses. */
    readonly retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** A 404 for an id that moved carries the item's new place (`docs/references.md` section 7). */
  get movedTo(): ItemRef | null {
    const moved = this.details.movedTo as ItemRef | undefined
    return this.status === 404 && moved && typeof moved.id === 'string' ? moved : null
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** The session ended (expired, revoked, or never existed): show the login. */
  get isSessionEnded(): boolean {
    return this.status === 401 && (this.code === '' || this.code === 'unauthenticated')
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
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
  fetchFn?: typeof fetch
  /** Called when a request fails because the session ended (401 `unauthenticated`). */
  onSessionEnded?: () => void
}

/** Bytes sent or received so far; `total` is null when the size is unknown. */
export type Progress = (loaded: number, total: number | null) => void

export interface RequestInitOptions {
  body?: BodyInit
  json?: unknown
  /** Reports the bytes of the body as they go out (uploads). */
  onUploadProgress?: Progress
  /** Do not report a 401 to `onSessionEnded` (login and link endpoints, the start check). */
  quiet401?: boolean
}

/**
 * Thin REST client for the MkDocsEditor backend. The browser sends the session cookie
 * (`credentials: 'include'`); the client never sees the session token.
 */
export class ApiClient {
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch
  /** Tests bring their own fetch; uploads with progress then go through it too, without it. */
  private readonly ownFetch: boolean
  onSessionEnded: (() => void) | undefined

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args))
    this.ownFetch = options.fetchFn === undefined
    this.onSessionEnded = options.onSessionEnded
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

  async request(method: string, path: string, init: RequestInitOptions = {}): Promise<Response> {
    // The backend needs this header on every changing request (CSRF protection). It also keeps
    // older backends from sending WWW-Authenticate, so the browser shows no login dialog.
    const headers = new Headers({ 'X-Requested-With': 'XMLHttpRequest' })
    let body = init.body
    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(init.json)
    }

    let response: Response
    try {
      response =
        init.onUploadProgress && this.ownFetch && typeof XMLHttpRequest !== 'undefined'
          ? await sendWithProgress(method, this.url(path), headers, body, init.onUploadProgress)
          : await this.fetchFn(this.url(path), {
              method,
              headers,
              body,
              credentials: 'include',
            })
    } catch (error) {
      throw new ApiError(
        `Server unreachable (${error instanceof Error ? error.message : String(error)})`,
        0,
      )
    }
    if (!response.ok) {
      const error = await toApiError(response)
      if (error.isSessionEnded && !init.quiet401) this.onSessionEnded?.()
      throw error
    }
    return response
  }

  async json<T>(method: string, path: string, init?: RequestInitOptions): Promise<T> {
    const response = await this.request(method, path, init)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  /** The signed-in user (401 when there is no session). */
  async whoami(init?: RequestInitOptions): Promise<WhoAmI> {
    return this.json<WhoAmI>('GET', '/auth/whoami', init)
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
    return nullWhen(
      [404, 405],
      this.json<AuthorshipResponse>('GET', urlPath`/document/${id}/authorship`),
    )
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
      await this.json<SectionModel>('PUT', urlPath`/section/${id}`, {
        json: { name },
      }),
    )
  }

  async deleteSection(id: string, force = false): Promise<void> {
    await this.request('DELETE', urlPath`/section/${id}` + forceQuery(force))
  }

  async getDocument(id: string): Promise<DocumentModel> {
    return this.json<DocumentModel>('GET', urlPath`/document/${id}`)
  }

  async getDocumentContent(id: string): Promise<string> {
    const response = await this.request('GET', urlPath`/document/${id}/content`)
    return response.text()
  }

  async createDocument(parentId: string, name: string): Promise<DocumentModel> {
    return this.json<DocumentModel>('POST', '/document', { json: { parent: parentId, name } })
  }

  async renameDocument(id: string, name: string): Promise<DocumentModel> {
    return this.json<DocumentModel>('PUT', urlPath`/document/${id}`, {
      json: { name },
    })
  }

  /** `force` deletes even while someone has the document open (otherwise 409). */
  async deleteDocument(id: string, force = false): Promise<void> {
    await this.request('DELETE', urlPath`/document/${id}` + forceQuery(force))
  }

  /**
   * Git history of a document, newest first. Returns null when the backend has no history
   * (git not enabled, or an older backend).
   */
  async getHistory(id: string, limit = 100): Promise<Revision[] | null> {
    return nullWhen(
      [404],
      this.json<Revision[]>('GET', urlPath`/document/${id}/history?limit=${limit}`),
    )
  }

  async getRevisionContent(id: string, revision: string): Promise<string> {
    const path = urlPath`/document/${id}/history/${revision}/content`
    return (await this.request('GET', path)).text()
  }

  /** Unified diff between two revisions; `current` is the live text. Empty when equal. */
  async getRevisionDiff(id: string, from: string, to = 'current'): Promise<string> {
    const query = new URLSearchParams({ from, to })
    return (await this.request('GET', `${urlPath`/document/${id}/history/diff`}?${query}`)).text()
  }

  /** Sets the live document to the text of `revision` (arrives as a normal edit). */
  async restoreRevision(id: string, revision: string): Promise<void> {
    await this.request('POST', urlPath`/document/${id}/history/${revision}/restore`)
  }

  /** References to an item from all documents ("used by"), sorted by source path and line. */
  async getBacklinks(type: ItemType, id: string): Promise<Backlink[]> {
    const answer = await this.json<{ backlinks: Backlink[] }>(
      'GET',
      urlPath`/${type}/${id}/backlinks`,
    )
    return answer.backlinks ?? []
  }

  /** All broken references of the wiki. */
  async getBrokenReferences(): Promise<BrokenReference[]> {
    return (
      (await this.json<{ broken: BrokenReference[] }>('GET', '/references/broken')).broken ?? []
    )
  }

  /** Resources that no document and `mkdocs.yml` use. */
  async getUnusedResources(): Promise<ResourceModel[]> {
    return (
      (await this.json<{ resources: ResourceModel[] }>('GET', '/references/unused-resources'))
        .resources ?? []
    )
  }

  /** Moves or renames an item and updates every reference to it; `dryRun` only previews. */
  async move(request: MoveRequest): Promise<MoveResult> {
    return this.json<MoveResult>('POST', '/move', { json: request })
  }

  /**
   * Where an old id points after a move (`GET /moved/{id}/`). Null when the id has not moved,
   * the item is gone, or the backend has no redirects.
   */
  async getMoved(id: string): Promise<MovedTo | null> {
    return nullWhen([404, 405], this.json<MovedTo>('GET', urlPath`/moved/${id}`))
  }

  /** The pinned pages, or null when the server has no pins. */
  async getPins(): Promise<Pins | null> {
    return nullWhen([404, 405], this.json<Pins>('GET', '/pins'))
  }

  /** Pins or unpins a page; returns all pins. Family pins need the editor or admin role. */
  async setPin(scope: PinScope, documentId: string, pinned: boolean): Promise<Pins> {
    return this.json<Pins>(pinned ? 'PUT' : 'DELETE', urlPath`/pins/${scope}/${documentId}`)
  }

  /**
   * Puts the pins of `scope` in the order of `documentIds`; returns all pins. Needs the
   * `pin-order` feature, and the editor or admin role for family pins.
   */
  async setPinOrder(scope: PinScope, documentIds: string[]): Promise<Pins> {
    return this.json<Pins>('PUT', urlPath`/pins/${scope}/order`, { json: { documentIds } })
  }

  /** The changes of all pages, newest first; null when the server has no feed. */
  async getFeed(before?: string, limit = 50): Promise<FeedPage | null> {
    const query = new URLSearchParams({ limit: String(limit) })
    if (before) query.set('before', before)
    return nullWhen([404, 405], this.json<FeedPage>('GET', `/feed?${query}`))
  }

  /** A profile picture. The hash changes with every new picture, so the result never goes stale. */
  async getAvatar(accountId: string, avatar: string): Promise<Blob> {
    return (await this.request('GET', urlPath`/avatars/${accountId}/${avatar}`)).blob()
  }

  async getResourceContent(id: string, onProgress?: Progress): Promise<Blob> {
    const response = await this.request('GET', urlPath`/resource/${id}/content`)
    return onProgress ? readWithProgress(response, onProgress) : response.blob()
  }

  /** A scaled-down JPEG or PNG of an image resource (newer backends, `thumbnail: true`). */
  async getResourceThumbnail(id: string, size = 256): Promise<Blob> {
    const response = await this.request('GET', urlPath`/resource/${id}/thumbnail?size=${size}`)
    return response.blob()
  }

  async uploadResource(
    parentId: string,
    name: string,
    file: Blob,
    onProgress?: Progress,
  ): Promise<ResourceModel> {
    const form = new FormData()
    form.append('file', file, name)
    return this.json<ResourceModel>('POST', urlPath`/resource/${parentId}/${name}`, {
      body: form,
      onUploadProgress: onProgress,
    })
  }

  async renameResource(id: string, name: string): Promise<ResourceModel> {
    return this.json<ResourceModel>('PUT', urlPath`/resource/${id}`, {
      json: { name },
    })
  }

  async deleteResource(id: string): Promise<void> {
    await this.request('DELETE', urlPath`/resource/${id}`)
  }
}

/** The answer of a request, or null for the statuses that mean "the backend has no such thing". */
async function nullWhen<T>(statuses: readonly number[], request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (error) {
    if (error instanceof ApiError && statuses.includes(error.status)) return null
    throw error
  }
}

/**
 * A request through XMLHttpRequest, the only way to see an upload's progress, answered as a
 * fetch `Response`. Like fetch, it has no time limit: a slow server is not an error.
 */
function sendWithProgress(
  method: string,
  url: string,
  headers: Headers,
  body: BodyInit | undefined,
  onProgress: Progress,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.withCredentials = true
    headers.forEach((value, key) => xhr.setRequestHeader(key, value))
    xhr.upload.onprogress = (event) =>
      onProgress(event.loaded, event.lengthComputable ? event.total : null)
    xhr.onload = () => {
      const responseHeaders = new Headers()
      for (const line of xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/)) {
        const cut = line.indexOf(':')
        if (cut > 0) responseHeaders.append(line.slice(0, cut).trim(), line.slice(cut + 1).trim())
      }
      const empty = xhr.status === 204 || xhr.status === 304
      resolve(
        new Response(empty ? null : xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders,
        }),
      )
    }
    xhr.onerror = () => reject(new Error('connection failed'))
    xhr.onabort = () => reject(new Error('aborted'))
    xhr.send(body as XMLHttpRequestBodyInit | null | undefined)
  })
}

/** The body of a response, reporting the bytes as they arrive. */
async function readWithProgress(response: Response, onProgress: Progress): Promise<Blob> {
  const length = Number(response.headers.get('Content-Length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
  const type = response.headers.get('Content-Type') ?? ''
  if (!response.body) return response.blob()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  onProgress(0, total)
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>
    try {
      next = await reader.read()
    } catch (error) {
      throw new ApiError(
        `Connection lost (${error instanceof Error ? error.message : String(error)})`,
        0,
      )
    }
    if (next.done) break
    chunks.push(next.value)
    loaded += next.value.byteLength
    onProgress(loaded, total)
  }
  return new Blob(chunks as BlobPart[], { type })
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `${response.status} ${response.statusText}`.trim()
  let message = fallback
  let code = ''
  let details: Record<string, unknown> = {}
  try {
    const text = await response.text()
    message = text.trim() !== '' ? text.trim() : fallback
    try {
      const body = JSON.parse(text) as { message?: unknown; code?: unknown; details?: unknown }
      if (typeof body.message === 'string' && body.message !== '') message = body.message
      if (typeof body.code === 'string') code = body.code
      if (typeof body.details === 'object' && body.details !== null)
        details = body.details as Record<string, unknown>
    } catch {
      // not JSON
    }
  } catch {
    // no body
  }
  let retryAfter: number | null = null
  if (response.status === 429) {
    const header = Number(response.headers.get('Retry-After'))
    const detail = Number(details.retryAfter)
    retryAfter =
      Number.isFinite(header) && header > 0 ? header : Number.isFinite(detail) ? detail : null
  }
  return new ApiError(message, response.status, code, details, retryAfter)
}
