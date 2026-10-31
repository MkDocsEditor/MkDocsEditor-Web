<script setup lang="ts">
import { mdiFingerprint, mdiShieldKey } from '@mdi/js'
import { computed, ref, watch } from 'vue'

import { ApiError, useAuthApi } from '@/api'
import type { AccountInfo } from '@/api'
import PasswordField from '@/components/auth/PasswordField.vue'
import { describeAuthError } from '@/services/authErrors'
import {
  describePasskeyError,
  getPasskey,
  isPasskeyCancel,
  passkeysSupported,
} from '@/services/passkeys'
import { useAuthStore } from '@/stores/auth'
import { useReauthStore } from '@/stores/reauth'

/** Asks for the password (plus TOTP code) or a passkey before a sensitive action. */
const reauth = useReauthStore()
const auth = useAuthStore()
const api = useAuthApi()

const account = ref<AccountInfo | null>(null)
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')

const needsPassword = computed(() => account.value?.hasPassword ?? true)
const needsCode = computed(() => account.value?.totpEnabled ?? false)
const offerPasskey = computed(
  () => auth.passkeysEnabled && passkeysSupported() && (account.value?.passkeyCount ?? 0) > 0,
)
const canSubmit = computed(
  () => (!needsPassword.value || password.value !== '') && (!needsCode.value || code.value !== ''),
)

watch(
  () => reauth.open,
  async (open) => {
    password.value = ''
    code.value = ''
    error.value = ''
    if (!open) return
    try {
      account.value = await api.account()
    } catch {
      account.value = null
    }
  },
)

async function submit(): Promise<void> {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.reauth({
      password: needsPassword.value ? password.value : undefined,
      code: needsCode.value ? code.value.replace(/\s/g, '') : undefined,
    })
    reauth.finish(true)
  } catch (e) {
    if (e instanceof ApiError && e.code === 'invalid-credentials') {
      error.value = needsCode.value ? 'Wrong password or code.' : 'Wrong password.'
    } else {
      error.value = describeAuthError(e) ?? String(e)
    }
  } finally {
    busy.value = false
  }
}

async function usePasskey(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const ceremony = await api.reauthPasskeyBegin()
    const credential = await getPasskey(ceremony.publicKey)
    await api.reauthPasskeyFinish(ceremony.ceremonyId, credential)
    reauth.finish(true)
  } catch (e) {
    if (!isPasskeyCancel(e)) error.value = describeAuthError(e) ?? describePasskeyError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="reauth.open"
    max-width="440"
    persistent
    @update:model-value="(open: boolean) => !open && reauth.finish(false)"
  >
    <v-card title="Confirm it is you" data-testid="reauth-dialog">
      <v-form @submit.prevent="submit">
        <v-card-text>
          <p class="mb-4">This change needs your credentials once more.</p>
          <input
            type="text"
            name="username"
            autocomplete="username"
            :value="auth.username"
            hidden
            readonly
          />
          <PasswordField
            v-if="needsPassword"
            v-model="password"
            :disabled="busy"
            autofocus
            data-testid="reauth-password"
          />
          <v-text-field
            v-if="needsCode"
            v-model="code"
            label="Code from the app"
            autocomplete="one-time-code"
            inputmode="numeric"
            :prepend-inner-icon="mdiShieldKey"
            :disabled="busy"
            :autofocus="!needsPassword"
            data-testid="reauth-code"
          />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" role="alert">
            {{ error }}
          </v-alert>
          <v-btn
            v-if="offerPasskey"
            variant="outlined"
            block
            class="mt-3"
            :prepend-icon="mdiFingerprint"
            :disabled="busy"
            data-testid="reauth-passkey"
            @click="usePasskey"
          >
            Confirm with a passkey
          </v-btn>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="busy" @click="reauth.finish(false)">Cancel</v-btn>
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            :loading="busy"
            :disabled="!canSubmit"
            data-testid="reauth-confirm"
          >
            Confirm
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
