import { useAuthApi } from '@/api'
import type { Passkey } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useReauthStore } from '@/stores/reauth'

import { createPasskey } from './passkeys'
import { clearPasskeyReminder } from './passkeyReminder'

/**
 * Registers a passkey for the signed-in account. Right after a sign-in the backend accepts
 * this without step-up; later it asks for one, which the step-up dialog handles.
 */
export async function addPasskey(name?: string): Promise<Passkey> {
  const api = useAuthApi()
  const auth = useAuthStore()
  const ceremony = await useReauthStore().run(() => api.passkeyAddBegin())
  const credential = await createPasskey(ceremony.publicKey)
  const passkey = await api.passkeyAddFinish(ceremony.ceremonyId, credential, name)
  if (auth.username) clearPasskeyReminder(auth.username)
  return passkey
}
