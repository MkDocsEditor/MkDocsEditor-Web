import { createHmac } from 'node:crypto'

import type { CDPSession, Page } from '@playwright/test'

/** Decodes RFC 4648 base32 (the TOTP secret format), ignoring padding, spaces and case. */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = alphabet.indexOf(char)
    if (index < 0) throw new Error(`not base32: ${char}`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** RFC 6238 TOTP code (SHA-1, 6 digits, 30 s), like an authenticator app. */
export function totp(secret: string, time = Date.now(), step = 30, digits = 6): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return code.toString().padStart(digits, '0')
}

export interface VirtualAuthenticator {
  cdp: CDPSession
  id: string
  credentialCount(): Promise<number>
  setPresence(enabled: boolean): Promise<void>
  remove(): Promise<void>
}

/**
 * A platform authenticator with resident keys and user verification, through the Chrome DevTools
 * WebAuthn domain. It answers every passkey request of the page without a dialog.
 */
export async function addVirtualAuthenticator(page: Page): Promise<VirtualAuthenticator> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return {
    cdp,
    id: authenticatorId,
    async credentialCount() {
      const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
      return credentials.length
    },
    /** With presence off, requests wait (like a user who has not touched the key yet). */
    async setPresence(enabled: boolean) {
      await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled })
    },
    async remove() {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
    },
  }
}
