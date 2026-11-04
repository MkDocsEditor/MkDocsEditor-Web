<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import type { InstanceSettings } from '@/api'
import LoadError from '@/components/common/LoadError.vue'
import { useLoad } from '@/composables/useLoad'
import { useNotifyStore } from '@/stores/notify'
import { useReauthStore } from '@/stores/reauth'

const api = useAuthApi()
const reauth = useReauthStore()
const notify = useNotifyStore()

const settings = ref<InstanceSettings | null>(null)
const busy = ref(false)

const { loadError, load } = useLoad({
  failure: 'Could not load the settings',
  hasData: () => settings.value !== null,
  fetch: async () => {
    settings.value = await api.settings()
  },
})

async function setRequire2FA(value: boolean | null): Promise<void> {
  if (!settings.value) return
  busy.value = true
  try {
    settings.value = await reauth.run(() => api.updateSettings({ require2FA: value === true }))
    notify.success('Saved')
  } catch (e) {
    notify.error(e)
    await load()
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <v-card title="Settings" data-testid="settings-admin">
    <v-card-text v-if="settings">
      <v-switch
        :model-value="settings.require2FA"
        color="primary"
        label="Require a second factor"
        :loading="busy"
        :disabled="busy"
        hide-details
        data-testid="require-2fa"
        @update:model-value="setRequire2FA"
      />
      <p class="text-medium-emphasis mt-2">
        Every account then needs a passkey or an authenticator app. Accounts without one must set it
        up after their next sign-in before they can continue.
      </p>
    </v-card-text>
    <v-card-text v-else-if="loadError">
      <LoadError title="Could not load the settings" :error="loadError" @retry="load" />
    </v-card-text>
    <v-progress-linear v-else indeterminate />
  </v-card>
</template>
