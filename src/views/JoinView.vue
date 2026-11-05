<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, useAuthApi } from '@/api'
import AuthCard from '@/components/auth/AuthCard.vue'
import { authErrorText } from '@/services/authErrors'
import {
  clearAccessRequest,
  clearJoinTarget,
  joinPath,
  loadAccessRequest,
  rememberJoinTarget,
  saveAccessRequest,
} from '@/services/join'
import { watchPage } from '@/sync/pageEvents'
import { useAuthStore } from '@/stores/auth'

/**
 * A join link (`/join/{documentId}?from={accountId}`). With a session it leads straight to the
 * document. Without one it offers to sign in or to ask an admin for access, and comes back here
 * afterwards.
 */
const props = defineProps<{ id: string }>()

/** At most this often: `docs/auth.md`, "Access request and join link". */
const POLL_MS = 30_000
/** Coming back to the tab asks right away, unless it just did. */
const WAKE_GAP_MS = 5_000
const NAME_MAX = 80
const MESSAGE_MAX = 500

const auth = useAuthStore()
const api = useAuthApi()
const route = useRoute()
const router = useRouter()

type Screen = 'checking' | 'choose' | 'form' | 'waiting' | 'decided'
const screen = ref<Screen>('checking')
const instance = ref('')
const canRequest = ref(false)

const from = computed(() => (typeof route.query.from === 'string' ? route.query.from : undefined))
const senderInstance = computed(() =>
  typeof route.query.instance === 'string' ? route.query.instance : undefined,
)
const target = computed(() => joinPath(props.id, from.value, senderInstance.value))

const name = ref('')
const message = ref('')
const valid = ref(false)
const busy = ref(false)
const error = ref('')
/** Why the request ended. */
const outcome = ref('')
/** The request is kept, because the server may accept requests again. */
const requestKept = ref(false)

function signIn(): void {
  rememberJoinTarget(target.value)
  void router.push({ name: 'login', query: { redirect: target.value } })
}

async function submit(): Promise<void> {
  if (!valid.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const created = await api.createAccessRequest({
      name: name.value.trim(),
      message: message.value.trim() || undefined,
      documentId: props.id,
      invitedBy: from.value,
    })
    saveAccessRequest({ token: created.token, expiresAt: created.expiresAt })
    rememberJoinTarget(target.value)
    screen.value = 'waiting'
    startPolling()
  } catch (e) {
    error.value = authErrorText(e)
  } finally {
    busy.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let stopWatchingPage: (() => void) | null = null
let lastPoll = 0
let notBefore = 0
let polling = false

function stopPolling(): void {
  if (timer) clearInterval(timer)
  timer = null
  stopWatchingPage?.()
  stopWatchingPage = null
}

function finish(text: string): void {
  stopPolling()
  clearAccessRequest()
  outcome.value = text
  screen.value = 'decided'
}

async function poll(): Promise<void> {
  const now = Date.now()
  // only in the foreground, and focus events can come in a row
  if (polling || document.visibilityState !== 'visible') return
  if (now - lastPoll < WAKE_GAP_MS || now < notBefore) return
  const stored = loadAccessRequest()
  if (!stored) {
    stopPolling()
    screen.value = 'choose'
    return
  }
  lastPoll = now
  polling = true
  try {
    const answer = await api.accessRequestStatus(stored.token)
    if (answer.status === 'approved' && answer.inviteToken) {
      stopPolling()
      // the invite page takes the token out of the fragment right away
      await router.replace({ name: 'invite', hash: `#${answer.inviteToken}` })
    } else if (answer.status === 'approved') {
      finish('Your request was approved and the invite is used. Please sign in.')
    } else if (answer.status === 'rejected') {
      finish('Your request was rejected.')
    } else if (answer.status === 'expired') {
      finish('Nobody decided on your request in time. You can send a new one.')
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'invalid-access-request') finish(authErrorText(e))
    else if (e instanceof ApiError && e.code === 'access-requests-disabled') {
      // the setting can come back on, and the request is still there then
      stopPolling()
      requestKept.value = true
      outcome.value = authErrorText(e)
      screen.value = 'decided'
    } else if (e instanceof ApiError && e.isRateLimited && e.retryAfter) {
      notBefore = Date.now() + e.retryAfter * 1000
    }
    // otherwise probably offline: the next round tries again
  } finally {
    polling = false
  }
}

function startPolling(): void {
  stopPolling()
  lastPoll = 0
  void poll()
  timer = setInterval(() => void poll(), POLL_MS)
  stopWatchingPage = watchPage({ onWake: () => void poll() })
}

function forgetRequest(): void {
  stopPolling()
  clearAccessRequest()
  error.value = ''
  screen.value = 'choose'
}

onMounted(async () => {
  try {
    await auth.ensureChecked()
  } catch {
    // the sign-in shows the error when it is tried
  }
  if (auth.isLoggedIn) {
    clearAccessRequest()
    if (auth.secondFactorSetupRequired) {
      // the only page such a session reaches; "home" comes back here when that is done
      rememberJoinTarget(target.value)
      await router.replace({ name: 'home' })
      return
    }
    clearJoinTarget()
    await router.replace({
      name: 'document',
      params: { id: props.id },
      query: {
        join: '1',
        ...(from.value ? { from: from.value } : {}),
        ...(senderInstance.value ? { instance: senderInstance.value } : {}),
      },
    })
    return
  }
  try {
    const info = await api.serverInfo()
    instance.value = info.name
    canRequest.value = info.features?.includes('access-requests') === true
  } catch {
    // an older or unreachable server: signing in stays possible
  }
  if (loadAccessRequest()) {
    rememberJoinTarget(target.value)
    screen.value = 'waiting'
    startPolling()
  } else {
    screen.value = 'choose'
  }
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <AuthCard title="Join this page" :subtitle="instance">
    <v-progress-linear v-if="screen === 'checking'" indeterminate aria-label="Checking" />

    <div v-else-if="screen === 'choose'" class="d-flex flex-column ga-2" data-testid="join-choose">
      <p class="mb-2">Someone shared a page with you. To open it, you need an account here.</p>
      <v-btn color="primary" variant="flat" block data-testid="join-sign-in" @click="signIn">
        Sign in
      </v-btn>
      <v-btn
        v-if="canRequest"
        variant="outlined"
        block
        data-testid="join-request"
        @click="screen = 'form'"
      >
        Request access
      </v-btn>
    </div>

    <v-form
      v-else-if="screen === 'form'"
      v-model="valid"
      data-testid="join-form"
      @submit.prevent="submit"
    >
      <p class="mb-4">An admin decides on your request and may ask you who you are.</p>
      <v-text-field
        v-model="name"
        label="Your name"
        autofocus
        :counter="NAME_MAX"
        :rules="[
          (v: string) => v.trim() !== '' || 'Please enter your name',
          (v: string) => v.length <= NAME_MAX || `At most ${NAME_MAX} characters`,
        ]"
        data-testid="join-name"
      />
      <v-textarea
        v-model="message"
        label="Message (optional)"
        rows="3"
        :counter="MESSAGE_MAX"
        :rules="[(v: string) => v.length <= MESSAGE_MAX || `At most ${MESSAGE_MAX} characters`]"
        data-testid="join-message"
      />
      <v-alert v-if="error" type="error" role="alert" class="mb-4">{{ error }}</v-alert>
      <div class="d-flex justify-end ga-2">
        <v-btn @click="screen = 'choose'">Back</v-btn>
        <v-btn
          type="submit"
          color="primary"
          variant="flat"
          :loading="busy"
          :disabled="!valid"
          data-testid="join-submit"
        >
          Send request
        </v-btn>
      </div>
    </v-form>

    <div v-else-if="screen === 'waiting'" data-testid="join-waiting">
      <v-progress-linear indeterminate class="mb-4" aria-label="Waiting for an admin" />
      <p class="mb-4">
        Your request is waiting for an admin. Keep this page open: it continues by itself when your
        request is approved.
      </p>
      <div class="d-flex justify-end">
        <v-btn data-testid="join-forget" @click="forgetRequest">Forget this request</v-btn>
      </div>
    </div>

    <div v-else data-testid="join-decided">
      <v-alert type="info" class="mb-4" role="status">{{ outcome }}</v-alert>
      <div class="d-flex justify-end ga-2">
        <v-btn v-if="!requestKept" @click="forgetRequest">Back</v-btn>
        <v-btn color="primary" variant="flat" @click="signIn">Sign in</v-btn>
      </div>
    </div>
  </AuthCard>
</template>
