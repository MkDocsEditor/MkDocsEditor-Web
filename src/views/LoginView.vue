<script setup lang="ts">
import { mdiAccount, mdiArrowLeft, mdiFingerprint, mdiKeyVariant, mdiShieldKey } from '@mdi/js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, useAuthApi } from '@/api'
import type { SecondFactorMethod, SessionResponse } from '@/api'
import AuthCard from '@/components/auth/AuthCard.vue'
import PasswordField from '@/components/auth/PasswordField.vue'
import { describeAuthError } from '@/services/authErrors'
import { useAndroidHint } from '@/services/androidHint'
import { vFocusOnce } from '@/services/focusOnce'
import { passkeyReminderDue } from '@/services/passkeyReminder'
import { getConfig } from '@/services/config'
import {
  cancelPasskeyRequest,
  describePasskeyError,
  getPasskey,
  isPasskeyCancel,
  passkeyAutofillSupported,
  passkeysSupported,
} from '@/services/passkeys'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const api = useAuthApi()
const route = useRoute()
const router = useRouter()
/** On a phone, the first login in this browser also suggests the Android app. */
const androidHintWanted = useAndroidHint()

const username = ref(auth.username)
const password = ref('')
const loading = ref(false)
const error = ref('')

/** Second step after a correct password, when the account has a second factor. */
const challenge = ref<{ token: string; methods: SecondFactorMethod[] } | null>(null)
const factor = ref<'totp' | 'recovery-code'>('totp')
const code = ref('')

const canUsePasskeys = computed(() => auth.passkeysEnabled && passkeysSupported())
const endedHint = ref(auth.sessionEnded)

function redirectTarget(): string {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  // only paths inside the app, never `//host`
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}

async function done(response: SessionResponse): Promise<void> {
  cancelPasskeyRequest()
  auth.signedIn(response.user)
  if (response.user.secondFactorSetupRequired) {
    await router.replace({ name: 'account', params: { tab: 'security' } })
  } else if (offerPasskey(response) || androidHintWanted()) {
    const target = redirectTarget()
    await router.replace({
      name: 'welcome',
      query: {
        ...(offerPasskey(response) ? { passkey: '1' } : {}),
        ...(androidHintWanted() ? { app: '1' } : {}),
        ...(target !== '/' ? { redirect: target } : {}),
      },
    })
  } else {
    await router.replace(redirectTarget())
  }
}

/** After a login without a passkey: suggest one, unless "Later" was chosen recently. */
function offerPasskey(response: SessionResponse): boolean {
  return (
    canUsePasskeys.value &&
    response.user.passkeyCount === 0 &&
    passkeyReminderDue(response.user.username)
  )
}

function showError(e: unknown): void {
  if (e instanceof ApiError && e.isNetworkError) {
    error.value = `The server is not reachable (${getConfig().backendUrl}).`
  } else if (e instanceof ApiError && e.code === 'challenge-expired' && challenge.value) {
    restart()
    error.value = describeAuthError(e) ?? e.message
  } else if (e instanceof ApiError && e.isUnauthorized && !e.code) {
    error.value = 'Wrong username or password.'
  } else {
    error.value = describeAuthError(e) ?? (e instanceof Error ? e.message : String(e))
  }
}

async function submitPassword(): Promise<void> {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  endedHint.value = false
  try {
    const response = await api.login(username.value.trim(), password.value)
    if (response.status === 'second-factor-required') {
      challenge.value = { token: response.challenge, methods: response.methods }
      factor.value = response.methods.includes('totp') ? 'totp' : 'recovery-code'
      code.value = ''
    } else {
      await done(response)
    }
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

async function submitCode(): Promise<void> {
  if (!challenge.value || !code.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const value = code.value.trim()
    await done(
      await api.secondFactor(
        challenge.value.token,
        factor.value === 'totp' ? { code: value.replace(/\s/g, '') } : { recoveryCode: value },
      ),
    )
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

/** Passkey login: discoverable (no username), or as the second factor after the password. */
async function passkeyLogin(): Promise<void> {
  cancelPasskeyRequest()
  loading.value = true
  error.value = ''
  try {
    const ceremony = await api.passkeyLoginBegin(challenge.value?.token)
    const credential = await getPasskey(ceremony.publicKey)
    await done(await api.passkeyLoginFinish(ceremony.ceremonyId, credential))
  } catch (e) {
    if (e instanceof ApiError) showError(e)
    else if (!isPasskeyCancel(e)) error.value = describePasskeyError(e)
  } finally {
    loading.value = false
  }
  if (!auth.isLoggedIn) void startAutofill()
}

/** Offers passkeys in the username field's autofill, where the browser supports it. */
let autofillRunning = false
async function startAutofill(): Promise<void> {
  if (autofillRunning || challenge.value || !canUsePasskeys.value) return
  if (!(await passkeyAutofillSupported())) return
  autofillRunning = true
  try {
    const ceremony = await api.passkeyLoginBegin()
    const credential = await getPasskey(ceremony.publicKey, true)
    loading.value = true
    await done(await api.passkeyLoginFinish(ceremony.ceremonyId, credential))
  } catch (e) {
    // aborted when the user starts another login; other failures show up like a normal login
    if (e instanceof ApiError) showError(e)
    else if (!isPasskeyCancel(e)) error.value = describePasskeyError(e)
  } finally {
    autofillRunning = false
    loading.value = false
  }
}

function restart(): void {
  challenge.value = null
  code.value = ''
  password.value = ''
  error.value = ''
  void startAutofill()
}

onMounted(async () => {
  if (!auth.status) {
    try {
      await auth.loadStatus()
    } catch {
      // unreachable: the login shows the error when it is tried
    }
  }
  if (auth.setupRequired) {
    await router.replace({ name: 'setup' })
    return
  }
  void startAutofill()
})
onBeforeUnmount(() => cancelPasskeyRequest())
</script>

<template>
  <AuthCard title="Sign in" subtitle="Edit the wiki">
    <v-alert
      v-if="endedHint && !error"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
      data-testid="session-ended"
    >
      Your session ended. Please sign in again. Unsaved changes are kept.
    </v-alert>

    <v-form v-if="!challenge" data-testid="login-form" @submit.prevent="submitPassword">
      <v-text-field
        id="login-username"
        v-model="username"
        v-focus-once
        label="Username"
        name="username"
        autocomplete="username webauthn"
        autocapitalize="none"
        spellcheck="false"
        :prepend-inner-icon="mdiAccount"
        :disabled="loading"
      />
      <PasswordField id="login-password" v-model="password" :disabled="loading" />
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="my-3"
        role="alert"
        data-testid="login-error"
      >
        {{ error }}
      </v-alert>
      <v-btn
        type="submit"
        color="primary"
        size="large"
        block
        class="mt-2"
        :loading="loading"
        :disabled="!username || !password"
      >
        Sign in
      </v-btn>
      <template v-if="canUsePasskeys">
        <div class="text-center text-medium-emphasis my-3">or</div>
        <v-btn
          variant="outlined"
          size="large"
          block
          :prepend-icon="mdiFingerprint"
          :disabled="loading"
          data-testid="passkey-login"
          @click="passkeyLogin"
        >
          Sign in with a passkey
        </v-btn>
      </template>
    </v-form>

    <v-form v-else data-testid="second-factor-form" @submit.prevent="submitCode">
      <p class="mb-4">
        <template v-if="factor === 'totp'">
          Enter the 6-digit code from your authenticator app.
        </template>
        <template v-else>Enter one of your recovery codes.</template>
      </p>
      <v-text-field
        v-if="factor === 'totp'"
        key="totp"
        v-model="code"
        v-focus-once
        label="Code from the app"
        name="otp"
        autocomplete="one-time-code"
        inputmode="numeric"
        :prepend-inner-icon="mdiShieldKey"
        :disabled="loading"
        data-testid="totp-input"
      />
      <v-text-field
        v-else
        key="recovery"
        v-model="code"
        v-focus-once
        label="Recovery code"
        name="recovery-code"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        placeholder="xxxx-xxxx-xxxx"
        :prepend-inner-icon="mdiKeyVariant"
        :disabled="loading"
        data-testid="recovery-input"
      />
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="my-3"
        role="alert"
        data-testid="login-error"
      >
        {{ error }}
      </v-alert>
      <v-btn
        type="submit"
        color="primary"
        size="large"
        block
        :loading="loading"
        :disabled="!code.trim()"
      >
        Confirm
      </v-btn>
      <div class="d-flex flex-column align-center ga-1 mt-4">
        <v-btn
          v-if="factor === 'totp' && challenge.methods.includes('recovery-code')"
          variant="text"
          size="small"
          @click="((factor = 'recovery-code'), (code = ''), (error = ''))"
        >
          Use a recovery code
        </v-btn>
        <v-btn
          v-if="factor === 'recovery-code' && challenge.methods.includes('totp')"
          variant="text"
          size="small"
          @click="((factor = 'totp'), (code = ''), (error = ''))"
        >
          Use the code from the app
        </v-btn>
        <v-btn
          v-if="challenge.methods.includes('passkey') && passkeysSupported()"
          variant="text"
          size="small"
          :prepend-icon="mdiFingerprint"
          :disabled="loading"
          @click="passkeyLogin"
        >
          Use a passkey
        </v-btn>
        <v-btn variant="text" size="small" :prepend-icon="mdiArrowLeft" @click="restart">
          Back
        </v-btn>
      </div>
    </v-form>
  </AuthCard>
</template>
