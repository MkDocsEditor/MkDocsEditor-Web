<script setup lang="ts">
import { mdiFingerprint } from '@mdi/js'
import { ref } from 'vue'

import { addPasskey } from '@/services/addPasskey'
import { describeAuthError } from '@/services/authErrors'
import { snoozePasskeyReminder } from '@/services/passkeyReminder'
import { describePasskeyError, isPasskeyCancel } from '@/services/passkeys'
import { ReauthCancelled } from '@/stores/reauth'

/** "Sign in with a passkey next time": offered right after a sign-in without a passkey. */
const props = defineProps<{ username: string }>()
const emit = defineEmits<{ created: []; later: [] }>()

const busy = ref(false)
const error = ref('')

async function create(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await addPasskey()
    emit('created')
  } catch (e) {
    if (e instanceof ReauthCancelled || isPasskeyCancel(e)) return
    error.value = describeAuthError(e) ?? describePasskeyError(e)
  } finally {
    busy.value = false
  }
}

function later(): void {
  snoozePasskeyReminder(props.username)
  emit('later')
}
</script>

<template>
  <section class="passkey-step" aria-labelledby="passkey-step-title" data-testid="passkey-step">
    <h2 id="passkey-step-title" class="text-h6 mb-2">Sign in with a passkey next time</h2>
    <p class="mb-2">
      A passkey replaces typing your password: you confirm with your fingerprint, face, screen lock
      or a security key. It only works on this site, so it cannot be phished.
    </p>
    <p class="mb-4 text-medium-emphasis">
      A password manager like Bitwarden (browser extension) can store the passkey. It then shows its
      own dialog instead of the browser's.
    </p>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3" role="alert">
      {{ error }}
    </v-alert>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        color="primary"
        variant="flat"
        :prepend-icon="mdiFingerprint"
        :loading="busy"
        data-testid="passkey-step-create"
        @click="create"
      >
        Create passkey
      </v-btn>
      <v-btn variant="text" :disabled="busy" data-testid="passkey-step-later" @click="later">
        Later
      </v-btn>
    </div>
  </section>
</template>
