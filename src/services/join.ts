import { local, readJson, remove, writeJson } from './storage'

/**
 * Join links (`docs/auth.md`, "Access request and join link"): `/join/{documentId}?from={accountId}`
 * holds no secret and grants nothing. The Android app handles the same path as an App Link.
 */
export function joinPath(documentId: string, from?: string): string {
  const query = from ? `?from=${encodeURIComponent(from)}` : ''
  return `/join/${encodeURIComponent(documentId)}${query}`
}

/** The link to share. This client is the host of the link, as `clientUrl` is on the server. */
export function joinLink(documentId: string, from?: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
  return `${base}${joinPath(documentId, from)}`
}

const TARGET_KEY = 'mkdocseditor.joinTarget'
/** As long as a request can wait for a decision, and a while to redeem the invite. */
const TARGET_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000

/** Where to go after the sign-in, the passkey step or the invite, which may be in another tab. */
export function rememberJoinTarget(path: string): void {
  writeJson(local(), TARGET_KEY, { path, savedAt: Date.now() })
}

export function clearJoinTarget(): void {
  remove(local(), TARGET_KEY)
}

/** The remembered join link, once. */
export function takeJoinTarget(now = Date.now()): string | null {
  const target = readJson<{ path?: unknown; savedAt?: unknown }>(local(), TARGET_KEY)
  clearJoinTarget()
  if (typeof target?.path !== 'string' || !target.path.startsWith('/join/')) return null
  if (typeof target.savedAt !== 'number' || now - target.savedAt > TARGET_LIFETIME_MS) return null
  return target.path
}

const REQUEST_KEY = 'mkdocseditor.accessRequest'

/** An open access request of this browser. The token stays here: never in a URL or a log. */
export interface StoredAccessRequest {
  token: string
  expiresAt: string
}

export function saveAccessRequest(request: StoredAccessRequest): void {
  writeJson(local(), REQUEST_KEY, request)
}

export function loadAccessRequest(): StoredAccessRequest | null {
  const stored = readJson<Partial<StoredAccessRequest>>(local(), REQUEST_KEY)
  return typeof stored?.token === 'string' && typeof stored.expiresAt === 'string'
    ? { token: stored.token, expiresAt: stored.expiresAt }
    : null
}

export function clearAccessRequest(): void {
  remove(local(), REQUEST_KEY)
}
