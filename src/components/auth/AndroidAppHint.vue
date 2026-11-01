<script setup lang="ts">
import { mdiAndroid } from '@mdi/js'
import { onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import { markAndroidHintSeen } from '@/services/androidHint'
import { describeAuthError } from '@/services/authErrors'
import { connectUrlFor, OBTAINIUM_ADD_URL } from '@/services/connectLink'
import { useAuthStore } from '@/stores/auth'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

/**
 * "Use the Android app", on a phone right after signing in: creates a connect link and opens
 * it on this device. The app takes it if installed; otherwise the connect page explains how to
 * install it.
 */
const emit = defineEmits<{ dismissed: [] }>()

const auth = useAuthStore()
const busy = ref(false)
const error = ref('')

async function open(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const api = useAuthApi()
    const created = await useReauthStore().run(() => api.createDeviceLink())
    window.location.assign(connectUrlFor(created, auth.username))
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) error.value = describeAuthError(e) ?? String(e)
  } finally {
    busy.value = false
  }
}

onMounted(markAndroidHintSeen)
</script>

<template>
  <section class="android-hint" aria-labelledby="android-hint-title" data-testid="android-hint">
    <h2 id="android-hint-title" class="text-h6 mb-2">Use the Android app</h2>
    <p class="mb-2">
      On a phone, the app is easier to use and also works offline. It signs in to this account with
      one tap.
    </p>
    <p class="mb-4 text-medium-emphasis">
      Not installed yet? Get it with
      <a :href="OBTAINIUM_ADD_URL" target="_blank" rel="noopener">Obtainium</a> (turn on
      pre-releases for it).
    </p>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3" role="alert">
      {{ error }}
    </v-alert>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        color="primary"
        variant="flat"
        :prepend-icon="mdiAndroid"
        :loading="busy"
        data-testid="android-hint-open"
        @click="open"
      >
        Open in the app
      </v-btn>
      <v-btn
        variant="text"
        :disabled="busy"
        data-testid="android-hint-dismiss"
        @click="emit('dismissed')"
      >
        Not now
      </v-btn>
    </div>
  </section>
</template>
