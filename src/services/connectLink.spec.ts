import { describe, expect, it } from 'vitest'

import {
  appUrlForPayload,
  connectUrlFor,
  decodeConnectPayload,
  encodeConnectPayload,
  mayUseAndroidApp,
} from './connectLink'

const payload = {
  v: 1,
  backendUrl: 'https://backend.wiki.example.com',
  username: 'jürgen',
  token: 'mdd_abc',
  expiresAt: '2026-11-01T12:05:00Z',
}

describe('connect links', () => {
  it('round-trips the payload as base64url without padding', () => {
    const encoded = encodeConnectPayload(payload)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeConnectPayload(encoded)).toEqual({ ok: true, payload })
    expect(decodeConnectPayload(`#${encoded}`)).toEqual({ ok: true, payload })
  })

  it('rejects missing, broken and newer payloads', () => {
    expect(decodeConnectPayload('')).toEqual({ ok: false, reason: 'missing' })
    expect(decodeConnectPayload('!!!')).toEqual({ ok: false, reason: 'invalid' })
    expect(decodeConnectPayload(encodeConnectPayload({ ...payload, v: 2 }))).toEqual({
      ok: false,
      reason: 'version',
    })
    const noToken = btoa(JSON.stringify({ v: 1, backendUrl: 'x', username: 'y' }))
    expect(decodeConnectPayload(noToken)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('uses the backend URL, or builds one when the backend has no clientUrl', () => {
    const created = {
      deviceLink: {
        id: 'd1',
        status: 'pending' as const,
        deviceName: null,
        createdAt: '',
        expiresAt: payload.expiresAt,
      },
      token: 'mdd_abc',
      expiresAt: payload.expiresAt,
      connectUrl: 'https://edit.example.com/connect#xyz',
    }
    expect(connectUrlFor(created, 'anna')).toBe('https://edit.example.com/connect#xyz')
    const built = connectUrlFor({ ...created, connectUrl: null }, 'anna')
    expect(built.startsWith(`${window.location.origin}/connect#`)).toBe(true)
    const decoded = decodeConnectPayload(built.split('#')[1] ?? '')
    expect(decoded.ok && decoded.payload).toMatchObject({
      v: 1,
      username: 'anna',
      token: 'mdd_abc',
    })
  })

  it('opens the app by its scheme and leaves iPhones out', () => {
    expect(appUrlForPayload('abc')).toBe('mkdocseditor://connect#abc')
    expect(mayUseAndroidApp('Mozilla/5.0 (Linux; Android 15; Pixel 8)')).toBe(true)
    expect(mayUseAndroidApp('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)')).toBe(false)
  })
})
