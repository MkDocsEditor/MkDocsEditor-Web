<script setup lang="ts">
import { mdiAccount, mdiCardAccountDetails, mdiFingerprint, mdiShieldKey } from '@mdi/js'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthApi } from '@/api'
import type { LinkInspection, LinkKind, SessionResponse } from '@/api'
import AuthCard from '@/components/auth/AuthCard.vue'
import PasskeyStep from '@/components/auth/PasskeyStep.vue'
import PasswordField from '@/components/auth/PasswordField.vue'
import {
  displayNameRule,
  formatTime,
  passwordRule,
  roleLabel,
  sameAsRule,
  usernameRule,
} from '@/services/accountRules'
import { vFocusOnce } from '@/services/focusOnce'
import { describeAuthError } from '@/services/authErrors'
import {
  createPasskey,
  describePasskeyError,
  isPasskeyCancel,
  passkeysSupported,
} from '@/services/passkeys'
import { useAuthStore } from '@/stores/auth'

/**
 * Setup, invite and reset links: `/setup#mdl_…`, `/invite#mdl_…`, `/reset#mdl_…`. The token sits
 * in the fragment, so it never reaches a web server log; it goes to the backend in request
 * bodies only and is removed from the address bar right away.
 */
const props = defineProps<{ kind: LinkKind }>()

const auth = useAuthStore()
const api = useAuthApi()
const route = useRoute()
const router = useRouter()

const token = ref('')
const pastedToken = ref('')
const link = ref<LinkInspection | null>(null)
const inspecting = ref(false)
const linkError = ref('')

const username = ref('')
const displayName = ref('')
const password = ref('')
const password2 = ref('')
const passkeyName = ref('')
const busy = ref(false)
const error = ref('')
const formValid = ref(false)
/** Signed in with the new account (or the reset): offer passkey and TOTP next. */
const finished = ref<SessionResponse | null>(null)
const addedPasskey = ref(false)

const kind = computed<LinkKind>(() => link.value?.kind ?? props.kind)
const isReset = computed(() => kind.value === 'reset')
const canUsePasskeys = computed(() => auth.passkeysEnabled && passkeysSupported())

const title = computed(
  () =>
    ({
      setup: 'Set up MkDocsEditor',
      invite: 'Create your account',
      reset: 'New password',
    })[kind.value],
)

const pwRules = computed(() => [passwordRule(auth.passwordPolicy)])
const pw2Rules = [sameAsRule(() => password.value)]

async function inspect(value: string): Promise<void> {
  token.value = value.trim()
  if (!token.value) return
  inspecting.value = true
  linkError.value = ''
  try {
    link.value = await api.inspectLink(token.value)
  } catch (e) {
    link.value = null
    linkError.value = describeAuthError(e) ?? (e instanceof Error ? e.message : String(e))
  } finally {
    inspecting.value = false
  }
}

function accountFields(): { username?: string; displayName?: string } {
  if (isReset.value) return {}
  return {
    username: username.value.trim(),
    displayName: displayName.value.trim() || undefined,
  }
}

async function submitPassword(): Promise<void> {
  if (!formValid.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const response = await api.redeemLink(token.value, {
      ...accountFields(),
      password: password.value,
    })
    signIn(response)
  } catch (e) {
    error.value = describeAuthError(e) ?? (e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

/** Creates the account (or resets it) with a passkey instead of a password. */
async function submitPasskey(): Promise<void> {
  if (!isReset.value && usernameRule(username.value) !== true) {
    error.value = 'Please enter a valid username first.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const ceremony = await api.linkPasskeyBegin(token.value, accountFields())
    const credential = await createPasskey(ceremony.publicKey)
    signIn(
      await api.linkPasskeyFinish(
        ceremony.ceremonyId,
        credential,
        passkeyName.value.trim() || undefined,
      ),
    )
    addedPasskey.value = true
  } catch (e) {
    if (!isPasskeyCancel(e)) error.value = describeAuthError(e) ?? describePasskeyError(e)
  } finally {
    busy.value = false
  }
}

function signIn(response: SessionResponse): void {
  auth.signedIn(response.user)
  password.value = ''
  password2.value = ''
  token.value = ''
  finished.value = response
}

const passkeySkipped = ref(false)
/** Right after the account exists: suggest a passkey, unless it was made with one. */
const showPasskeyStep = computed(
  () =>
    canUsePasskeys.value &&
    !addedPasskey.value &&
    !passkeySkipped.value &&
    (finished.value?.user.passkeyCount ?? 0) === 0,
)

async function passkeyCreated(): Promise<void> {
  addedPasskey.value = true
  await auth.refresh()
}

async function goOn(): Promise<void> {
  if (auth.secondFactorSetupRequired)
    await router.replace({ name: 'account', params: { tab: 'security' } })
  else await router.replace({ name: 'home' })
}

/** Takes the token out of the fragment, so it stays out of the address bar and the history. */
async function takeTokenFromHash(): Promise<string> {
  const fromHash = route.hash.replace(/^#/, '')
  if (fromHash) await router.replace({ path: route.path, query: route.query, hash: '' })
  return fromHash
}

onMounted(async () => {
  const fromHash = await takeTokenFromHash()
  if (!auth.status) {
    try {
      await auth.loadStatus()
    } catch {
      // shows up when the link is inspected
    }
  }
  if (fromHash) await inspect(decodeURIComponent(fromHash))
})

// A link opened while this page is already shown only changes the fragment.
watch(
  () => route.hash,
  async (hash) => {
    if (!hash || hash === '#') return
    const fromHash = await takeTokenFromHash()
    if (fromHash) await inspect(decodeURIComponent(fromHash))
  },
)
</script>

<template>
  <AuthCard :title="title" :max-width="480">
    <!-- 1. no token in the link -->
    <v-form
      v-if="!token && !finished"
      data-testid="token-form"
      @submit.prevent="inspect(pastedToken)"
    >
      <p class="mb-4">
        <template v-if="kind === 'setup'">
          Open the setup link from the server log or paste its token. A new link:
          <code>mkdocsrest setup-link</code>.
        </template>
        <template v-else>Open the link you received or paste its token.</template>
      </p>
      <v-text-field
        v-model="pastedToken"
        label="Token"
        placeholder="mdl_…"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        data-testid="token-input"
      />
      <v-btn type="submit" color="primary" block :disabled="!pastedToken.trim()">Continue</v-btn>
    </v-form>

    <!-- 2. checking the link -->
    <div v-else-if="inspecting" class="d-flex justify-center pa-6">
      <v-progress-circular indeterminate aria-label="Checking the link" />
    </div>

    <!-- 3. invalid link -->
    <div v-else-if="linkError && !finished">
      <v-alert type="error" variant="tonal" role="alert" data-testid="link-error">
        {{ linkError }}
      </v-alert>
      <v-btn variant="text" class="mt-4" :to="{ name: 'login' }">To sign in</v-btn>
    </div>

    <!-- 4. done: offer passkey and TOTP -->
    <div v-else-if="finished" data-testid="link-done">
      <v-alert type="success" variant="tonal" class="mb-4">
        <template v-if="isReset">New password set. You are signed in.</template>
        <template v-else>
          Welcome, {{ finished.user.displayName }}! Your account is ready.
        </template>
      </v-alert>
      <v-card v-if="showPasskeyStep" variant="outlined" class="pa-4 mb-4">
        <PasskeyStep
          :username="finished.user.username"
          @created="passkeyCreated"
          @later="passkeySkipped = true"
        />
      </v-card>
      <v-alert v-if="addedPasskey" type="success" variant="tonal" density="compact" class="mb-4">
        Passkey created. Next time, pick it when you sign in.
      </v-alert>
      <p class="mb-3">Also possible later under “Account”:</p>
      <div class="d-flex flex-column ga-2">
        <v-btn
          :prepend-icon="mdiShieldKey"
          variant="tonal"
          :to="{ name: 'account', params: { tab: 'security' } }"
          data-testid="done-setup-totp"
        >
          Set up an authenticator app
        </v-btn>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" role="alert">
          {{ error }}
        </v-alert>
        <v-btn color="primary" class="mt-2" data-testid="done-continue" @click="goOn">
          Continue to the wiki
        </v-btn>
      </div>
    </div>

    <!-- 5. the form -->
    <v-form
      v-else-if="link"
      v-model="formValid"
      data-testid="link-form"
      @submit.prevent="submitPassword"
    >
      <v-alert type="info" variant="tonal" density="compact" class="mb-4" data-testid="link-info">
        <template v-if="link.kind === 'setup'">
          You are creating the first account. It gets the role <strong>Admin</strong>.
        </template>
        <template v-else-if="link.kind === 'invite'">
          Invitation with the role <strong>{{ roleLabel(link.role) }}</strong
          >.
          <span v-if="link.note"><br />Note: {{ link.note }}</span>
        </template>
        <template v-else>
          New password for <strong>{{ link.displayName || link.username }}</strong> ({{
            link.username
          }}). All other devices are signed out afterwards.
          <span v-if="link.resetSecondFactors">
            <br />The authenticator app, recovery codes and passkeys are removed.
          </span>
        </template>
        <br />
        <span class="text-medium-emphasis">Valid until {{ formatTime(link.expiresAt) }}</span>
      </v-alert>

      <template v-if="!isReset">
        <v-text-field
          v-model="username"
          v-focus-once
          label="Username"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          :prepend-inner-icon="mdiAccount"
          :rules="[usernameRule]"
          :disabled="busy"
        />
        <v-text-field
          v-model="displayName"
          label="Display name"
          name="name"
          autocomplete="name"
          hint="What the others see. Empty: the username."
          persistent-hint
          class="mb-2"
          :prepend-inner-icon="mdiCardAccountDetails"
          :rules="[displayNameRule]"
          :disabled="busy"
        />
      </template>
      <!-- password managers want the username next to the new password -->
      <input
        v-else
        type="text"
        name="username"
        autocomplete="username"
        :value="link.username"
        hidden
        readonly
      />

      <PasswordField
        v-model="password"
        v-focus-once="isReset"
        label="New password"
        name="new-password"
        autocomplete="new-password"
        :rules="pwRules"
        :hint="`At least ${auth.passwordPolicy.minLength} characters. A sentence of several words is easy to remember.`"
        :disabled="busy"
      />
      <PasswordField
        v-model="password2"
        label="Repeat the password"
        name="new-password-repeat"
        autocomplete="new-password"
        :rules="pw2Rules"
        :disabled="busy"
        class="mt-2"
      />
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="my-3"
        role="alert"
        data-testid="link-form-error"
      >
        {{ error }}
      </v-alert>
      <v-btn
        type="submit"
        color="primary"
        size="large"
        block
        :loading="busy"
        :disabled="!formValid"
      >
        {{ isReset ? 'Set password' : 'Create account' }}
      </v-btn>

      <template v-if="canUsePasskeys">
        <div class="text-center text-medium-emphasis my-3">or without a password</div>
        <v-btn
          variant="outlined"
          size="large"
          block
          :prepend-icon="mdiFingerprint"
          :disabled="busy"
          data-testid="link-passkey"
          @click="submitPasskey"
        >
          {{ isReset ? 'Reset with a passkey' : 'Create with a passkey' }}
        </v-btn>
      </template>
    </v-form>
  </AuthCard>
</template>
