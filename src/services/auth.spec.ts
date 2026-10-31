import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api'
import QrCode from '@/components/auth/QrCode.vue'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

import { passwordLength, passwordRule, totpRule, usernameRule } from './accountRules'
import { describeAuthError, waitText } from './authErrors'
import { isPasskeyCancel } from './passkeys'

vi.mock('@simplewebauthn/browser', async (importOriginal) => {
  const original = await importOriginal<typeof import('@simplewebauthn/browser')>()
  return {
    ...original,
    startRegistration: vi.fn(async (options: unknown) => options),
    startAuthentication: vi.fn(async (options: unknown) => options),
  }
})

describe('auth error texts', () => {
  it('keeps login errors generic and explains limits', () => {
    expect(describeAuthError(new ApiError('x', 401, 'invalid-credentials'))).toBe(
      'Wrong username or password.',
    )
    expect(describeAuthError(new ApiError('x', 429, 'rate-limited', {}, 120))).toBe(
      'Too many attempts. Please wait 2 minutes.',
    )
    expect(
      describeAuthError(new ApiError('x', 400, 'weak-password', { reason: 'too-short' })),
    ).toBe('The password is too short.')
    expect(describeAuthError(new ApiError('x', 500, ''))).toBeNull()
    expect(describeAuthError(new Error('x'))).toBeNull()
    expect(waitText(5)).toBe('5 seconds')
  })
})

describe('account rules', () => {
  it('match the backend rules', () => {
    expect(usernameRule('anna.b-2')).toBe(true)
    expect(usernameRule('.anna')).not.toBe(true)
    expect(usernameRule('a:b')).not.toBe(true)
    expect(usernameRule(null)).not.toBe(true)
    expect(passwordLength('äöü😀')).toBe(4)
    const rule = passwordRule({ minLength: 10, maxLength: 12 })
    expect(rule('123456789')).toBe('At least 10 characters')
    expect(rule('1234567890')).toBe(true)
    expect(rule('1234567890123')).toBe('At most 12 characters')
    expect(totpRule('123 456')).toBe(true)
    expect(totpRule('12345')).not.toBe(true)
  })
})

describe('passkeys', () => {
  it('passes the publicKey options to the browser, also when wrapped', async () => {
    const { createPasskey, getPasskey } = await import('./passkeys')
    expect(await createPasskey({ publicKey: { a: 1 } })).toEqual({ optionsJSON: { a: 1 } })
    expect(await getPasskey({ b: 2 }, true)).toEqual({
      optionsJSON: { b: 2 },
      useBrowserAutofill: true,
    })
  })

  it('treats a closed dialog as a cancel', () => {
    expect(isPasskeyCancel(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe(true)
    expect(isPasskeyCancel(new Error('x'))).toBe(false)
  })
})

describe('QrCode', () => {
  it('renders an SVG with a label', () => {
    const wrapper = mount(QrCode, { props: { value: 'otpauth://totp/x?secret=ABC', label: 'QR' } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-label')).toBe('QR')
    expect(svg.find('path').attributes('d')).toMatch(/^M\d/)
  })
})

describe('reauth store', () => {
  it('retries once after confirming and stops when cancelled', async () => {
    setActivePinia(createPinia())
    const reauth = useReauthStore()
    let calls = 0
    const action = async () => {
      calls++
      if (calls === 1) throw new ApiError('x', 403, 'reauth-required')
      return 'ok'
    }
    const result = reauth.run(action)
    await Promise.resolve()
    await Promise.resolve()
    expect(reauth.open).toBe(true)
    reauth.finish(true)
    expect(await result).toBe('ok')
    expect(calls).toBe(2)

    const cancelled = reauth.run(() => Promise.reject(new ApiError('x', 403, 'reauth-required')))
    await Promise.resolve()
    await Promise.resolve()
    reauth.finish(false)
    await expect(cancelled).rejects.toBeInstanceOf(ReauthCancelled)

    // other errors pass through without a dialog
    await expect(
      reauth.run(() => Promise.reject(new ApiError('x', 403, 'forbidden'))),
    ).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
