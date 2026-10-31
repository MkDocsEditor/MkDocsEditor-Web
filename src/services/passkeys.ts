import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
  WebAuthnError,
} from '@simplewebauthn/browser'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

export type { AuthenticationResponseJSON, RegistrationResponseJSON }

/**
 * Passkeys (WebAuthn) in the browser. The backend sends the options in the JSON form of the spec,
 * possibly wrapped in `{ publicKey: ... }` like `navigator.credentials` expects.
 */

function unwrap<T>(options: unknown): T {
  const record = options as { publicKey?: unknown }
  return (
    record && typeof record === 'object' && 'publicKey' in record ? record.publicKey : options
  ) as T
}

export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn()
}

/** Whether the browser can offer passkeys in the username field's autofill (conditional UI). */
export async function passkeyAutofillSupported(): Promise<boolean> {
  try {
    return await browserSupportsWebAuthnAutofill()
  } catch {
    return false
  }
}

export async function createPasskey(options: unknown): Promise<RegistrationResponseJSON> {
  return startRegistration({
    optionsJSON: unwrap<PublicKeyCredentialCreationOptionsJSON>(options),
  })
}

export async function getPasskey(
  options: unknown,
  autofill = false,
): Promise<AuthenticationResponseJSON> {
  return startAuthentication({
    optionsJSON: unwrap<PublicKeyCredentialRequestOptionsJSON>(options),
    useBrowserAutofill: autofill,
  })
}

/** Stops a pending autofill request, for example before a button-started passkey login. */
export function cancelPasskeyRequest(): void {
  WebAuthnAbortService.cancelCeremony()
}

/** True when the user just closed the browser's passkey dialog: no error message needed. */
export function isPasskeyCancel(error: unknown): boolean {
  if (error instanceof WebAuthnError) return error.code === 'ERROR_CEREMONY_ABORTED'
  return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

/** Message for a failed passkey ceremony. */
export function describePasskeyError(error: unknown): string {
  if (error instanceof WebAuthnError) {
    if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')
      return 'This passkey is already added.'
    if (error.code === 'ERROR_INVALID_DOMAIN' || error.code === 'ERROR_INVALID_RP_ID')
      return 'Passkeys do not work on this address (the domain does not match the server setting).'
  }
  if (isPasskeyCancel(error)) return 'Cancelled or timed out.'
  return error instanceof Error ? error.message : String(error)
}
