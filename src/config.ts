/**
 * Runtime configuration of the web client.
 *
 * The values come from `config.json`, which is served next to `index.html`. The container
 * generates it from environment variables at start, so one image works for every deployment.
 */
export interface AppConfig {
  /**
   * Absolute base URL of the MkDocsEditor backend, for example `https://wiki.example.com/api`.
   * Without a value, the backend is at `/api` of the app's own origin.
   */
  backendUrl: string
  /** Base URL of the rendered MkDocs site, for example `https://wiki.example.com/view`. Optional. */
  wikiUrl: string
}

/** Where the backend is when nothing else is configured: `/api` on the app's own origin. */
export const SAME_ORIGIN_BACKEND = '/api'

const DEFAULT_CONFIG: AppConfig = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || SAME_ORIGIN_BACKEND,
  wikiUrl: import.meta.env.VITE_WIKI_URL ?? '',
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** A backend URL, also a path like `/api`, as an absolute URL against the app's origin. */
function absoluteBackendUrl(url: string): string {
  return stripTrailingSlash(new URL(url, window.location.origin).href)
}

/** Merges a parsed `config.json` with the defaults and normalizes the URLs. */
export function parseConfig(raw: unknown, defaults: AppConfig = DEFAULT_CONFIG): AppConfig {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const pick = (key: keyof AppConfig): string => {
    const value = source[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : defaults[key]
  }
  return {
    backendUrl: absoluteBackendUrl(pick('backendUrl')),
    wikiUrl: stripTrailingSlash(pick('wikiUrl')),
  }
}

let current: AppConfig = parseConfig({})

/**
 * Loads `config.json`. A missing or broken file is not fatal: the defaults (or the `VITE_*`
 * variables of a dev build) are used instead.
 */
export async function loadConfig(fetchFn: typeof fetch = fetch): Promise<AppConfig> {
  try {
    const response = await fetchFn(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' })
    current = parseConfig(response.ok ? await response.json() : {})
  } catch {
    current = parseConfig({})
  }
  return current
}

export function getConfig(): AppConfig {
  return current
}
