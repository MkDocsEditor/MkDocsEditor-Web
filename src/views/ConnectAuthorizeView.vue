<script setup lang="ts">
import { mdiAlertOutline, mdiRobotOutline } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'

import { ApiError, useAuthApi } from '@/api'
import type { AppTokenScope, OAuthRequest } from '@/api'
import AuthCard from '@/components/auth/AuthCard.vue'
import { describeOAuthTarget } from '@/services/oauthConsent'
import { SCOPE_CHOICES } from '@/services/appTokens'
import { useAuthStore } from '@/stores/auth'
import { describeError } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

/**
 * An MCP client (Claude Code, Cursor, …) asks for access with OAuth: the backend sends the browser
 * here with `?request=<id>`. The user sees who asks for what, and where the answer goes, then
 * allows or refuses; the browser then goes back to the client (`docs/oauth.md`).
 */
const props = defineProps<{ request: string }>()

const api = useAuthApi()
const auth = useAuthStore()
const reauth = useReauthStore()

const info = ref<OAuthRequest | null>(null)
const error = ref('')
const loading = ref(true)
const busy = ref<'approve' | 'deny' | null>(null)
const scope = ref<AppTokenScope>('read')
/** After the answer, for clients the browser cannot leave this page for (custom schemes). */
const decided = ref<'approved' | 'denied' | null>(null)

const target = computed(() => (info.value ? describeOAuthTarget(info.value.redirectUri) : null))
const scopeChoices = computed(() =>
  SCOPE_CHOICES.filter((choice) => info.value?.allowedScopes.includes(choice.value)),
)

function failure(e: unknown): string {
  if (e instanceof ApiError && e.status === 404)
    return 'This request is no longer valid: it expired after 10 minutes, or was answered already. Start connecting again in the app.'
  return describeError(e)
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!props.request) throw new ApiError('No request', 404, 'not-found')
    info.value = await api.oauthRequest(props.request)
    const requested = info.value.scope
    scope.value = info.value.allowedScopes.includes(requested) ? requested : 'read'
  } catch (e) {
    error.value = failure(e)
  } finally {
    loading.value = false
  }
}

async function decide(answer: 'approve' | 'deny'): Promise<void> {
  if (!info.value) return
  busy.value = answer
  error.value = ''
  const id = info.value.id
  try {
    const { redirectUrl } =
      answer === 'approve'
        ? await reauth.run(() => api.approveOAuthRequest(id, scope.value))
        : await api.denyOAuthRequest(id)
    decided.value = answer === 'approve' ? 'approved' : 'denied'
    // built by the server from a redirect URI the client registered: http(s) or an app's scheme
    window.location.assign(redirectUrl)
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) error.value = failure(e)
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<template>
  <AuthCard title="Connect an app" :subtitle="auth.displayName || auth.username">
    <v-progress-linear v-if="loading" indeterminate aria-label="Loading" />

    <template v-else-if="decided">
      <v-alert
        :type="decided === 'approved' ? 'success' : 'info'"
        variant="tonal"
        data-testid="oauth-decided"
      >
        {{
          decided === 'approved'
            ? `Allowed. Go back to ${info?.clientName ?? 'the app'}; you can close this tab.`
            : 'Refused. The app got no access; you can close this tab.'
        }}
      </v-alert>
    </template>

    <template v-else-if="info && target">
      <div class="d-flex align-center ga-4 mb-4">
        <v-avatar color="primary" variant="tonal" size="48">
          <v-icon :icon="mdiRobotOutline" />
        </v-avatar>
        <p data-testid="oauth-client">
          An app that calls itself <strong>{{ info.clientName }}</strong> wants to
          {{ scope === 'write' ? 'read and edit' : 'read' }} the wiki as you.
        </p>
      </div>

      <v-sheet border rounded class="pa-4 mb-4" data-testid="oauth-target">
        <div class="text-label-medium text-medium-emphasis">
          After your answer, the browser goes to
        </div>
        <div class="text-title-medium" data-testid="oauth-target-host">{{ target.label }}</div>
        <div class="text-body-small text-medium-emphasis oauth__uri">{{ info.redirectUri }}</div>
        <div v-if="target.local" class="text-body-small mt-1">An app on this computer.</div>
      </v-sheet>

      <v-alert
        v-if="!target.local"
        type="warning"
        variant="tonal"
        :icon="mdiAlertOutline"
        class="mb-4"
        data-testid="oauth-remote"
      >
        This app is not on this computer. Only allow it if you just started connecting it yourself.
      </v-alert>
      <p v-else class="mb-4 text-medium-emphasis">
        Only allow this if you just started connecting the app yourself, not because of a link
        someone sent you.
      </p>

      <v-radio-group
        v-if="scopeChoices.length > 1"
        v-model="scope"
        label="Access"
        hide-details
        class="mb-2"
        data-testid="oauth-scope"
      >
        <v-radio
          v-for="choice in scopeChoices"
          :key="choice.value"
          :value="choice.value"
          :label="choice.title"
        />
      </v-radio-group>
      <p v-else class="mb-2" data-testid="oauth-read-only">
        Access: read only{{ info.scope === 'write' ? ' (your role cannot edit)' : '' }}
      </p>
      <p class="mb-4 text-body-small text-medium-emphasis">
        It gets a token that lasts as long as the app keeps using it. Revoke it any time in Settings
        › AI agents and tokens.
      </p>

      <v-alert v-if="error" type="error" class="mb-4" role="alert">{{ error }}</v-alert>

      <div class="d-flex justify-end ga-2">
        <v-btn
          variant="outlined"
          :loading="busy === 'deny'"
          :disabled="busy !== null"
          data-testid="oauth-deny"
          @click="decide('deny')"
        >
          Refuse
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="busy === 'approve'"
          :disabled="busy !== null"
          data-testid="oauth-approve"
          @click="decide('approve')"
        >
          Allow
        </v-btn>
      </div>
    </template>

    <template v-else>
      <v-alert type="error" variant="tonal" class="mb-4" role="alert" data-testid="oauth-error">
        {{ error }}
      </v-alert>
      <v-btn :to="{ name: 'home' }">To the wiki</v-btn>
    </template>
  </AuthCard>
</template>

<style scoped>
.oauth__uri {
  word-break: break-all;
}
</style>
