import type { CreatedDeviceLink } from '@/api'

import { getConfig } from './config'

/**
 * Connect links pair the Android app with an account (`docs/auth.md`, device pairing):
 * `{web client}/connect#<payload>`, where the payload is base64url JSON. The payload stays in
 * the fragment, so it never reaches a server or its logs.
 */

export const ANDROID_REPO = 'https://github.com/MkDocsEditor/MkDocsEditor-Android'
/** Adds the app to Obtainium, which installs and updates it from the GitHub releases. */
export const OBTAINIUM_ADD_URL = `https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/${ANDROID_REPO}`
export const OBTAINIUM_HOME = 'https://obtainium.imranr.dev'
/** Fallback scheme of the app, for browsers that do not follow the App Link. */
export const APP_SCHEME = 'mkdocseditor'

export interface ConnectPayload {
  v: number
  backendUrl: string
  username: string
  token: string
  expiresAt: string
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function encodeConnectPayload(payload: ConnectPayload): string {
  return toBase64Url(JSON.stringify(payload))
}

export type DecodedConnect =
  { ok: true; payload: ConnectPayload } | { ok: false; reason: 'missing' | 'invalid' | 'version' }

/** Reads a connect payload; only for display, the app does the actual pairing. */
export function decodeConnectPayload(raw: string): DecodedConnect {
  const value = raw.replace(/^#/, '').trim()
  if (!value) return { ok: false, reason: 'missing' }
  try {
    const data = JSON.parse(fromBase64Url(value)) as Partial<ConnectPayload>
    if (typeof data !== 'object' || data === null) return { ok: false, reason: 'invalid' }
    if (data.v !== 1) return { ok: false, reason: 'version' }
    if (
      typeof data.backendUrl !== 'string' ||
      typeof data.username !== 'string' ||
      typeof data.token !== 'string' ||
      typeof data.expiresAt !== 'string'
    )
      return { ok: false, reason: 'invalid' }
    return { ok: true, payload: data as ConnectPayload }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

function webClientBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
}

/** The connect URL of a new device link; built here when the backend has no `clientUrl`. */
export function connectUrlFor(created: CreatedDeviceLink, username: string): string {
  if (created.connectUrl) return created.connectUrl
  const backendUrl = new URL(getConfig().backendUrl, window.location.origin).href.replace(
    /\/+$/,
    '',
  )
  const payload = encodeConnectPayload({
    v: 1,
    backendUrl,
    username,
    token: created.token,
    expiresAt: created.expiresAt,
  })
  return `${webClientBase()}/connect#${payload}`
}

export function connectUrlForPayload(payload: string): string {
  return `${webClientBase()}/connect#${payload}`
}

/** Opens the app directly through its own scheme, for when the App Link did not. */
export function appUrlForPayload(payload: string): string {
  return `${APP_SCHEME}://connect#${payload}`
}

/** Phone-sized screens get the app hint, except on iPhones and iPads (Android app only). */
export function mayUseAndroidApp(userAgent = globalThis.navigator?.userAgent ?? ''): boolean {
  return !/iPhone|iPad|iPod/i.test(userAgent)
}
