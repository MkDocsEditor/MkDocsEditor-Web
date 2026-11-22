import { describe, expect, it } from 'vitest'

import type { GitRemoteStatus } from '@/api'

import {
  connectErrorText,
  connectResultOf,
  daysUntilExpiry,
  expiresSoon,
  withoutConnectResult,
} from './gitRemote'

const NOW = Date.parse('2026-11-22T12:00:00Z')

function status(overrides: Partial<GitRemoteStatus> = {}): GitRemoteStatus {
  return {
    state: 'connected',
    pushEnabled: true,
    repo: 'markus/Wiki',
    provider: 'forgejo',
    providerName: 'Forgejo',
    providerUrl: 'https://git.example.org',
    grantsUrl: 'https://git.example.org/user/settings/applications',
    scopedGrants: false,
    expectedUser: 'mkdocseditor',
    allowAdmin: false,
    remoteUser: { login: 'mkdocseditor', avatarUrl: null, isAdmin: false },
    canPush: true,
    connectedAt: '2026-11-01T10:00:00Z',
    connectedBy: 'markus',
    lastRefreshAt: '2026-11-22T03:00:00Z',
    refreshExpiresAt: '2026-12-22T03:00:00Z',
    lastRefreshError: null,
    lastPushAt: null,
    lastPushError: null,
    ...overrides,
  }
}

describe('connectResultOf', () => {
  it('reads success, failure with reason and login, and nothing', () => {
    expect(connectResultOf({ 'git-remote': 'connected' })).toEqual({
      ok: true,
      reason: '',
      login: null,
    })
    expect(
      connectResultOf({ 'git-remote': 'error', reason: 'wrong-user', login: 'markus' }),
    ).toEqual({
      ok: false,
      reason: 'wrong-user',
      login: 'markus',
    })
    expect(connectResultOf({ 'git-remote': 'error' })).toEqual({
      ok: false,
      reason: '',
      login: null,
    })
    expect(connectResultOf({})).toBeNull()
    expect(connectResultOf({ 'git-remote': 'other' })).toBeNull()
  })

  it('takes the first of repeated keys', () => {
    expect(
      connectResultOf({ 'git-remote': ['error', 'connected'], reason: ['state', 'x'] })?.reason,
    ).toBe('state')
  })
})

describe('withoutConnectResult', () => {
  it('keeps other keys', () => {
    expect(
      withoutConnectResult({ 'git-remote': 'error', reason: 'x', login: 'y', tab: 'a' }),
    ).toEqual({
      tab: 'a',
    })
  })
})

describe('connectErrorText', () => {
  it('names who approved and who is expected for a wrong user', () => {
    const { text, grantLeft } = connectErrorText(
      { ok: false, reason: 'wrong-user', login: 'markus' },
      status(),
    )
    expect(text).toContain('markus approved')
    expect(text).toContain('Sign out of Forgejo')
    expect(text).toContain('sign in as mkdocseditor')
    expect(grantLeft).toBe(true)
  })

  it('explains why an admin is refused', () => {
    const { text, grantLeft } = connectErrorText(
      { ok: false, reason: 'admin-user', login: 'markus' },
      status(),
    )
    expect(text).toContain('markus is an admin on Forgejo')
    expect(text).toContain('Forgejo grants no narrower access')
    expect(text).toContain('markus/Wiki')
    expect(grantLeft).toBe(true)
  })

  it('leaves out the all-rights sentence for a host with scoped grants', () => {
    const { text } = connectErrorText(
      { ok: false, reason: 'admin-user', login: 'markus' },
      status({ scopedGrants: true }),
    )
    expect(text).not.toContain('narrower')
  })

  it('has a text for every agreed reason and a fallback', () => {
    for (const reason of [
      'denied',
      'state',
      'exchange',
      'not-pushable',
      'session',
      'not-configured',
    ]) {
      expect(connectErrorText({ ok: false, reason, login: null }, status()).text).not.toContain(
        `(${reason})`,
      )
    }
    expect(connectErrorText({ ok: false, reason: 'boom', login: null }, status()).text).toBe(
      'Could not connect to Forgejo (boom).',
    )
  })

  it('does without an expected user and a provider name', () => {
    const { text } = connectErrorText(
      { ok: false, reason: 'wrong-user', login: null },
      status({ expectedUser: null, providerName: null }),
    )
    expect(text).toContain('The user approved')
    expect(text).toContain('the user the server should push as')
    expect(text).toContain('Sign out of the git host')
  })
})

describe('expiry', () => {
  it('counts whole days left', () => {
    expect(daysUntilExpiry(status(), NOW)).toBe(29)
    expect(daysUntilExpiry(status({ refreshExpiresAt: '2026-11-20T00:00:00Z' }), NOW)).toBe(0)
    expect(daysUntilExpiry(status({ refreshExpiresAt: null }), NOW)).toBeNull()
  })

  it('warns within a week, only while connected', () => {
    expect(expiresSoon(status(), NOW)).toBe(false)
    const soon = { refreshExpiresAt: '2026-11-25T12:00:00Z' }
    expect(expiresSoon(status(soon), NOW)).toBe(true)
    expect(expiresSoon(status({ ...soon, state: 'error' }), NOW)).toBe(true)
    expect(expiresSoon(status({ ...soon, state: 'expired' }), NOW)).toBe(false)
  })
})
