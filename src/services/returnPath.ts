import type { Router } from 'vue-router'

/**
 * Where to go after the sign-in: `?next=` (from the wiki's login check, for example
 * `/view/Haus/`) or `?redirect=` (from the app itself). Only a path on this host counts, so a
 * link cannot send someone elsewhere after the login (open redirect).
 */

/** The value as a path on this host, or undefined when it is none. */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // A single leading slash: `//host` and `/\host` are other hosts to a browser; a backslash,
  // whitespace or control character anywhere could be read as one too.
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return undefined
  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return undefined
  }
  if (url.origin !== window.location.origin) return undefined
  return `${url.pathname}${url.search}${url.hash}`
}

/** The path to go to after the sign-in, from the query of the login page; `/` without one. */
export function returnPathOf(query: Record<string, unknown>): string {
  const first = (value: unknown) => (Array.isArray(value) ? value[0] : value)
  return safeReturnPath(first(query.next)) ?? safeReturnPath(first(query.redirect)) ?? '/'
}

/**
 * Whether a path belongs to the app. Others, like the published wiki at `/view/`, share the host
 * but are no route of the app; they need a page load.
 */
export function isAppPath(router: Router, path: string): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
  if (base && path !== base && !path.startsWith(`${base}/`)) return false
  const resolved = router.resolve(path.slice(base.length) || '/')
  // only the catch-all matches: no page of the app
  return resolved.matched.length > 0 && !resolved.matched.some((r) => r.path === '/:pathMatch(.*)*')
}

/** Goes to the path: a route of the app in place, anything else with a page load. */
export async function goToReturnPath(router: Router, path: string): Promise<void> {
  if (isAppPath(router, path)) {
    await router.replace(path.slice(import.meta.env.BASE_URL.replace(/\/+$/, '').length) || '/')
  } else {
    window.location.assign(path)
  }
}
