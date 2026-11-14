<script setup lang="ts">
import { mdiDelete, mdiKeyVariant, mdiPlus } from '@mdi/js'
import { onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import type { AppToken, AppTokenScope, CreatedAppToken } from '@/api'
import CopyField from '@/components/auth/CopyField.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadError from '@/components/common/LoadError.vue'
import { useLoad } from '@/composables/useLoad'
import { EXPIRY_CHOICES, SCOPE_CHOICES, tokenNameRule } from '@/services/appTokens'
import { formatTime } from '@/services/time'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

/** App tokens: long-lived keys for scripts and AI agents, shown once after creating. */
const api = useAuthApi()
const notify = useNotifyStore()
const reauth = useReauthStore()

const tokens = ref<AppToken[]>([])
const busy = ref(false)
const creating = ref(false)
const name = ref('')
const scope = ref<AppTokenScope>('write')
const expiresInDays = ref<number | null>(90)
const created = ref<CreatedAppToken | null>(null)
const revoking = ref<AppToken | null>(null)

const { loading, loadError, load } = useLoad({
  failure: 'Could not load the app tokens',
  hasData: () => tokens.value.length > 0,
  fetch: async () => {
    tokens.value = await api.appTokens()
  },
})

function expired(token: AppToken): boolean {
  return token.expiresAt !== null && Date.parse(token.expiresAt) <= Date.now()
}

function details(token: AppToken): string {
  const parts = [
    token.scope === 'write' ? 'Read and write' : 'Read only',
    `created ${formatTime(token.createdAt)}`,
    token.lastUsedAt ? `last used ${formatTime(token.lastUsedAt)}` : 'never used',
    token.expiresAt
      ? `${expired(token) ? 'expired' : 'expires'} ${formatTime(token.expiresAt)}`
      : 'never expires',
  ]
  return parts.join(' · ')
}

function startCreate(): void {
  name.value = ''
  scope.value = 'write'
  expiresInDays.value = 90
  creating.value = true
}

async function create(): Promise<void> {
  const trimmed = name.value.trim()
  if (tokenNameRule(trimmed) !== true) return
  busy.value = true
  try {
    created.value = await reauth.run(() =>
      api.createAppToken({
        name: trimmed,
        scope: scope.value,
        ...(expiresInDays.value ? { expiresInDays: expiresInDays.value } : {}),
      }),
    )
    creating.value = false
    await load()
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busy.value = false
  }
}

async function revoke(token: AppToken): Promise<void> {
  busy.value = true
  try {
    await api.revokeAppToken(token.id)
    if (created.value?.appToken.id === token.id) created.value = null
    notify.success(`Revoked ${token.name}`)
    await load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <v-card data-testid="app-tokens-card">
    <v-card-item>
      <v-card-title>App tokens</v-card-title>
      <v-card-subtitle>Keys for scripts and AI agents</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <!-- the new token, shown once -->
      <v-alert
        v-if="created"
        type="success"
        variant="tonal"
        class="mb-4"
        data-testid="app-token-created"
      >
        <p class="mb-2">
          <strong>{{ created.appToken.name }}</strong> is ready. Copy the token now: you won't see
          it again.
        </p>
        <CopyField :value="created.token" label="Token" testid="app-token-value" />
        <v-btn class="mt-4" data-testid="app-token-done" @click="created = null">
          I have copied it
        </v-btn>
      </v-alert>

      <p class="mb-2 text-medium-emphasis">
        A token acts as you, without a second factor. Give it only to tools you trust.
      </p>
      <v-progress-linear v-if="loading" indeterminate />
      <LoadError
        v-else-if="loadError"
        title="Could not load the app tokens"
        :error="loadError"
        @retry="load"
      />
      <v-list v-else-if="tokens.length" lines="three" data-testid="app-token-list">
        <v-list-item
          v-for="token in tokens"
          :key="token.id"
          :prepend-icon="mdiKeyVariant"
          :class="{ 'text-medium-emphasis': expired(token) }"
          data-testid="app-token"
        >
          <v-list-item-title>
            {{ token.name }}
            <v-chip
              v-if="token.oauthClientId"
              size="x-small"
              class="ml-1"
              data-testid="oauth-badge"
            >
              OAuth app
            </v-chip>
            <v-chip v-if="expired(token)" size="x-small" class="ml-1">expired</v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>{{ details(token) }}</v-list-item-subtitle>
          <template #append>
            <v-btn
              :icon="mdiDelete"
              size="small"
              :disabled="busy"
              :aria-label="`Revoke ${token.name}`"
              @click="revoking = token"
            />
          </template>
        </v-list-item>
      </v-list>
      <p v-else class="text-medium-emphasis">No app tokens yet.</p>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn
        :prepend-icon="mdiPlus"
        color="primary"
        variant="outlined"
        data-testid="app-token-add"
        @click="startCreate"
      >
        Create a token
      </v-btn>
    </v-card-actions>

    <AppDialog v-model="creating">
      <v-card title="New app token">
        <v-form data-testid="app-token-form" @submit.prevent="create">
          <v-card-text class="d-flex flex-column ga-2">
            <v-text-field
              v-model="name"
              label="Name"
              hint="Where you use it, for example “Backup script”"
              persistent-hint
              autofocus
              :rules="[tokenNameRule]"
              data-testid="app-token-name"
            />
            <v-radio-group
              v-model="scope"
              label="Access"
              hide-details
              data-testid="app-token-scope"
            >
              <v-radio
                v-for="choice in SCOPE_CHOICES"
                :key="choice.value"
                :value="choice.value"
                :label="choice.title"
              />
            </v-radio-group>
            <v-select
              v-model="expiresInDays"
              :items="EXPIRY_CHOICES"
              label="Expires"
              data-testid="app-token-expiry"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn @click="creating = false">Cancel</v-btn>
            <v-btn
              type="submit"
              color="primary"
              variant="flat"
              :loading="busy"
              :disabled="tokenNameRule(name) !== true"
              data-testid="app-token-create"
            >
              Create
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </AppDialog>
    <ConfirmDialog
      :model-value="revoking !== null"
      title="Revoke the token?"
      :text="
        revoking?.oauthClientId
          ? `“${revoking.name}” is disconnected at once. It has to ask for access again.`
          : `Scripts and agents that use “${revoking?.name}” stop working at once.`
      "
      confirm-text="Revoke"
      danger
      @update:model-value="(open: boolean) => !open && (revoking = null)"
      @confirm="revoking && revoke(revoking)"
    />
  </v-card>
</template>
