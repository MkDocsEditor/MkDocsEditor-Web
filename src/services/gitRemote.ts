import type { GitRemoteStatus } from '@/api'

/**
 * Texts of the connection to the git host (Forgejo so far) that gives the server its push
 * credential. After the approval the backend sends the browser to
 * `/admin/settings?git-remote=connected` or `?git-remote=error&reason=…[&login=…]`.
 */

/** The outcome of a connection attempt, from the query after the callback. */
export interface ConnectResult {
  ok: boolean
  reason: string
  /** The login on the git host that approved, if the backend got that far. */
  login: string | null
}

/** Days within which a running out refresh token is worth a warning. */
export const EXPIRY_WARNING_DAYS = 7

const QUERY_KEYS = ['git-remote', 'reason', 'login'] as const

function first(value: unknown): string | null {
  const one = Array.isArray(value) ? value[0] : value
  return typeof one === 'string' ? one : null
}

/** The result in the query, or null when the page was not opened by the callback. */
export function connectResultOf(query: Record<string, unknown>): ConnectResult | null {
  const outcome = first(query['git-remote'])
  if (outcome === 'connected') return { ok: true, reason: '', login: null }
  if (outcome !== 'error') return null
  return { ok: false, reason: first(query.reason) ?? '', login: first(query.login) || null }
}

/** The query without the keys of the callback. */
export function withoutConnectResult(query: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...query }
  for (const key of QUERY_KEYS) delete rest[key]
  return rest
}

/** The name of the git host for texts. */
export function providerName(status: Pick<GitRemoteStatus, 'providerName'>): string {
  return status.providerName || 'the git host'
}

/** The user to sign in as, for the texts. */
export function pushUser(status: Pick<GitRemoteStatus, 'expectedUser'>): string {
  return status.expectedUser ?? 'the user the server should push as'
}

type TextStatus = Pick<GitRemoteStatus, 'expectedUser' | 'repo' | 'providerName' | 'scopedGrants'>

/** The sentence why an admin of the git host is a risk. */
export function adminRiskText(status: TextStatus): string {
  return status.scopedGrants
    ? 'The server should not hold the rights of an admin.'
    : `The server holds every right of that user, as ${providerName(status)} grants no narrower access.`
}

/** The text for a failed attempt, and whether a grant was left in that account. */
export function connectErrorText(
  result: ConnectResult,
  status: TextStatus,
): { text: string; grantLeft: boolean } {
  const host = providerName(status)
  const who = result.login ?? 'The user'
  const repo = status.repo ?? 'the repository'
  switch (result.reason) {
    case 'denied':
      return { text: `${host} did not grant access: the approval was cancelled.`, grantLeft: false }
    case 'state':
      return {
        text: 'The connection attempt ran out or was started in another window. Connect again.',
        grantLeft: false,
      }
    case 'exchange':
      return {
        text:
          `${host} did not accept the approval. Connect again. If it keeps failing, check the ` +
          'client ID and secret in the server configuration.',
        grantLeft: false,
      }
    case 'not-pushable':
      return {
        text: `${who} may not push to ${repo}. Give the user write access to the repository, then connect again.`,
        grantLeft: true,
      }
    case 'wrong-user':
      return {
        text: `${who} approved, but the server only accepts ${pushUser(status)}. Sign out of ${host}, then connect again and sign in as ${pushUser(status)}.`,
        grantLeft: true,
      }
    case 'admin-user':
      return {
        text:
          `${who} is an admin on ${host}, and the server refuses admins. ` +
          `${adminRiskText(status)} Connect a user that may only push to ${repo}.`,
        grantLeft: true,
      }
    case 'session':
      return {
        text: `Your session ended while ${host} asked for the approval. Connect again.`,
        grantLeft: false,
      }
    case 'not-configured':
      return { text: 'Pushing is no longer set up on this server.', grantLeft: false }
    default:
      return {
        text: `Could not connect to ${host}${result.reason ? ` (${result.reason})` : ''}.`,
        grantLeft: false,
      }
  }
}

/** Whole days until the refresh token runs out, or null without one. */
export function daysUntilExpiry(
  status: Pick<GitRemoteStatus, 'refreshExpiresAt'>,
  now = Date.now(),
): number | null {
  const time = status.refreshExpiresAt ? new Date(status.refreshExpiresAt).getTime() : NaN
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((time - now) / 86_400_000))
}

/** Whether the connection is about to run out: the server could not refresh it for days. */
export function expiresSoon(status: GitRemoteStatus, now = Date.now()): boolean {
  if (status.state !== 'connected' && status.state !== 'error') return false
  const days = daysUntilExpiry(status, now)
  return days !== null && days < EXPIRY_WARNING_DAYS
}
