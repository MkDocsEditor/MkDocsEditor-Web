<script setup lang="ts">
import { mdiCellphoneLink, mdiCheckCircle, mdiContentCopy, mdiOpenInNew } from '@mdi/js'
import { computed, onBeforeUnmount, ref } from 'vue'

import { useAuthApi } from '@/api'
import type { CreatedDeviceLink, DeviceLink } from '@/api'
import QrCode from '@/components/auth/QrCode.vue'
import { describeAuthError } from '@/services/authErrors'
import { copyText } from '@/services/clipboard'
import { connectUrlFor, OBTAINIUM_ADD_URL } from '@/services/connectLink'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

/** "Connect the Android app": a single-use pairing link, shown as a QR code. */
const emit = defineEmits<{ connected: [] }>()

const api = useAuthApi()
const auth = useAuthStore()
const notify = useNotifyStore()
const reauth = useReauthStore()

const created = ref<CreatedDeviceLink | null>(null)
const link = ref<DeviceLink | null>(null)
const busy = ref(false)
const error = ref('')
const copied = ref(false)
const now = ref(Date.now())

let clock: ReturnType<typeof setInterval> | undefined
let poll: ReturnType<typeof setInterval> | undefined

const url = computed(() => (created.value ? connectUrlFor(created.value, auth.username) : ''))
const secondsLeft = computed(() => {
  if (!created.value) return 0
  return Math.max(0, Math.round((Date.parse(created.value.expiresAt) - now.value) / 1000))
})
const countdown = computed(() => {
  const s = secondsLeft.value
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const status = computed(() => {
  if (!link.value) return 'none'
  if (link.value.status === 'pending' && secondsLeft.value === 0) return 'expired'
  return link.value.status
})

function stopTimers(): void {
  clearInterval(clock)
  clearInterval(poll)
  clock = poll = undefined
}

async function refresh(): Promise<void> {
  if (!link.value) return
  try {
    link.value = await api.deviceLink(link.value.id)
  } catch {
    // keep showing the last state; the next poll tries again
  }
  if (link.value.status !== 'pending') {
    stopTimers()
    if (link.value.status === 'redeemed') emit('connected')
  }
}

async function create(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    created.value = await reauth.run(() => api.createDeviceLink())
    link.value = created.value.deviceLink
    now.value = Date.now()
    stopTimers()
    clock = setInterval(() => {
      now.value = Date.now()
      if (secondsLeft.value === 0) stopTimers()
    }, 1000)
    poll = setInterval(() => void refresh(), 2000)
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) error.value = describeAuthError(e) ?? String(e)
  } finally {
    busy.value = false
  }
}

async function revoke(): Promise<void> {
  if (!link.value) return
  stopTimers()
  try {
    await api.revokeDeviceLink(link.value.id)
  } catch (e) {
    notify.error(e)
  }
  created.value = null
  link.value = null
}

async function copy(): Promise<void> {
  copied.value = await copyText(url.value)
  if (!copied.value) notify.error('The browser did not allow copying. Select the link instead.')
  setTimeout(() => (copied.value = false), 2000)
}

function reset(): void {
  stopTimers()
  created.value = null
  link.value = null
}

onBeforeUnmount(stopTimers)
</script>

<template>
  <v-card data-testid="connect-app">
    <v-card-item :prepend-icon="mdiCellphoneLink">
      <v-card-title>Connect the Android app</v-card-title>
      <v-card-subtitle>Sign in on your phone without typing anything</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <template v-if="status === 'none'">
        <p class="mb-2">
          Creates a link that signs the app in to this account. It works once, for 5 minutes.
        </p>
        <p class="mb-4 text-medium-emphasis">
          Don't have the app? Install it with
          <a :href="OBTAINIUM_ADD_URL" target="_blank" rel="noopener">Obtainium</a> (turn on
          pre-releases for it).
        </p>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
          role="alert"
        >
          {{ error }}
        </v-alert>
        <v-btn
          color="primary"
          variant="flat"
          :prepend-icon="mdiCellphoneLink"
          :loading="busy"
          data-testid="connect-create"
          @click="create"
        >
          Create a connect link
        </v-btn>
      </template>

      <template v-else-if="status === 'pending'">
        <p class="mb-3">
          Scan with your phone's camera. Don't have the app? Install it with
          <a :href="OBTAINIUM_ADD_URL" target="_blank" rel="noopener">Obtainium</a> (turn on
          pre-releases for it), then scan again.
        </p>
        <div class="d-flex justify-center mb-2">
          <QrCode :value="url" :size="280" label="QR code to connect the Android app" />
        </div>
        <p class="text-center mb-4" aria-live="polite" data-testid="connect-countdown">
          Valid for {{ countdown }}
        </p>
        <div class="d-flex flex-wrap justify-center ga-2">
          <v-btn
            variant="tonal"
            :prepend-icon="copied ? mdiCheckCircle : mdiContentCopy"
            data-testid="connect-copy"
            @click="copy"
          >
            {{ copied ? 'Copied' : 'Copy link' }}
          </v-btn>
          <v-btn
            variant="tonal"
            :prepend-icon="mdiOpenInNew"
            :href="url"
            data-testid="connect-open"
          >
            Open on this device
          </v-btn>
          <v-btn variant="text" color="error" data-testid="connect-revoke" @click="revoke">
            Cancel
          </v-btn>
        </div>
      </template>

      <template v-else-if="status === 'redeemed'">
        <v-alert type="success" variant="tonal" class="mb-3" data-testid="connect-done">
          Connected{{ link?.redeemedDeviceName ? `: ${link.redeemedDeviceName}` : '' }}. The app is
          signed in and shows up in the list below.
        </v-alert>
        <v-btn variant="text" @click="reset">Connect another device</v-btn>
      </template>

      <template v-else>
        <v-alert type="info" variant="tonal" class="mb-3" data-testid="connect-expired">
          {{
            status === 'revoked'
              ? 'The link was cancelled.'
              : 'The link expired. Create a new one when your phone is ready.'
          }}
        </v-alert>
        <v-btn color="primary" variant="flat" :loading="busy" @click="create">
          Create a new link
        </v-btn>
      </template>
    </v-card-text>
  </v-card>
</template>
