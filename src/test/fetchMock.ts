import { vi } from 'vitest'

export interface RecordedRequest {
  method: string
  url: string
  headers: Headers
  body: unknown
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>

/** A fetch replacement that routes `METHOD url` to handlers and records every request. */
export function createFetchMock(routes: Record<string, Handler>) {
  const requests: RecordedRequest[] = []
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const request: RecordedRequest = {
      method,
      url,
      headers: new Headers(init?.headers),
      body: init?.body,
    }
    requests.push(request)
    const path = new URL(url).pathname
    const handler = routes[`${method} ${path}`]
    if (!handler) return json({ message: `no route for ${method} ${path}` }, 404)
    return handler(request)
  })
  return { fetchFn: fetchFn as unknown as typeof fetch, requests }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
