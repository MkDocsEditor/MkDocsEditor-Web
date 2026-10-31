import { ApiError } from '@/api'

/** "5 seconds", "3 minutes" */
export function waitText(seconds: number): string {
  if (seconds < 90) {
    const n = Math.max(1, Math.round(seconds))
    return `${n} ${n === 1 ? 'second' : 'seconds'}`
  }
  const n = Math.ceil(seconds / 60)
  return `${n} ${n === 1 ? 'minute' : 'minutes'}`
}

const WEAK_PASSWORD: Record<string, string> = {
  'too-short': 'The password is too short.',
  'too-long': 'The password is too long.',
  common: 'This password is too common: it is on lists of leaked passwords.',
  repetitive: 'The password is too simple (a repetition or a sequence).',
  'contains-username': 'The password must not contain the username.',
}

/**
 * Message for errors of the account endpoints (`docs/auth.md` section 10). Messages for
 * failed logins stay generic, so they do not reveal whether an account exists.
 */
export function describeAuthError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.isNetworkError) return 'The server is not reachable right now.'
  switch (error.code) {
    case 'invalid-credentials':
      return 'Wrong username or password.'
    case 'invalid-second-factor': {
      const left = Number(error.details.attemptsLeft)
      return Number.isFinite(left) && error.status === 401
        ? `Wrong code. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
        : 'Wrong code.'
    }
    case 'challenge-expired':
      return 'The sign-in expired. Please start again.'
    case 'passkey-verification-failed':
      return 'The passkey was not recognized.'
    case 'passkey-registration-failed':
      return 'Could not add the passkey.'
    case 'passkeys-disabled':
      return 'Passkeys are not set up on this server.'
    case 'account-disabled':
      return 'This account is disabled. Ask an admin.'
    case 'rate-limited':
      return error.retryAfter
        ? `Too many attempts. Please wait ${waitText(error.retryAfter)}.`
        : 'Too many attempts. Please wait a moment.'
    case 'invalid-link':
      return 'This link is invalid, expired or already used. Please ask for a new one.'
    case 'invalid-username':
      return 'Username: 1 to 32 characters, only letters, digits, dot, dash and underscore, starting with a letter or digit.'
    case 'username-taken':
      return 'This username is taken.'
    case 'weak-password':
      return WEAK_PASSWORD[String(error.details.reason)] ?? 'The password is too weak.'
    case 'last-login-method':
      return 'Not possible: you could not sign in any more.'
    case 'second-factor-required':
      return 'Not possible: this server requires a second factor.'
    case 'totp-already-enabled':
      return 'The authenticator app is already set up.'
    case 'totp-not-enabled':
      return 'The authenticator app is not set up.'
    case 'second-factor-setup-required':
      return 'Set up a second factor first.'
    case 'reauth-required':
      return 'Please confirm it is you first.'
    case 'forbidden':
      return 'You are not allowed to do this.'
    case 'csrf-check-failed':
    case 'origin-not-allowed':
      return 'The server refuses requests from this address (check the CORS setting).'
    case 'conflict':
      return `Not possible: ${error.message}`
  }
  if (error.isRateLimited) return 'Too many attempts. Please wait a moment.'
  return null
}
