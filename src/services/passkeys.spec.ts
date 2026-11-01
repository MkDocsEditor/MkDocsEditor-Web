import { WebAuthnError } from '@simplewebauthn/browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPasskey,
  describePasskeyError,
  getPasskey,
  isPasskeyCancel,
  PasskeyProviderError,
} from './passkeys'

const browser = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  ...browser,
}))

describe('passkey ceremonies', () => {
  beforeEach(() => {
    browser.startAuthentication.mockReset()
    browser.startRegistration.mockReset()
  })

  it('turns an unknown error of the provider into a provider error', async () => {
    // what Bitwarden's page script throws with two copies of its scripts in the page
    browser.startAuthentication.mockRejectedValue(new Error('Something went wrong.'))
    browser.startRegistration.mockRejectedValue(new Error('Something went wrong.'))
    await expect(getPasskey({})).rejects.toBeInstanceOf(PasskeyProviderError)
    await expect(createPasskey({})).rejects.toBeInstanceOf(PasskeyProviderError)
  })

  it('keeps cancellations and known errors', async () => {
    const cancelled = Object.assign(new Error('The user closed it.'), { name: 'NotAllowedError' })
    browser.startAuthentication.mockRejectedValueOnce(cancelled)
    await expect(getPasskey({})).rejects.toBe(cancelled)

    const known = new WebAuthnError({
      message: 'wrong domain',
      code: 'ERROR_INVALID_RP_ID',
      cause: new Error('x'),
    })
    browser.startAuthentication.mockRejectedValueOnce(known)
    await expect(getPasskey({})).rejects.toBe(known)
  })

  it('does not count a provider error as a cancellation', () => {
    expect(isPasskeyCancel(new PasskeyProviderError('x'))).toBe(false)
  })

  it('explains a provider error and names the alternative', () => {
    const error = new PasskeyProviderError('Something went wrong.')
    const message = describePasskeyError(error, 'confirm with your password')
    expect(message).toContain('("Something went wrong.")')
    expect(message).toContain('reload the page')
    expect(message).toContain('or confirm with your password instead')
    expect(describePasskeyError(error)).not.toContain(' instead')
  })
})
