<script setup lang="ts">
import { mdiAccount, mdiDevices, mdiShieldLock } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthApi } from '@/api'
import type { AccountInfo } from '@/api'
import PasskeysCard from '@/components/account/PasskeysCard.vue'
import PasswordCard from '@/components/account/PasswordCard.vue'
import ProfileCard from '@/components/account/ProfileCard.vue'
import SessionsCard from '@/components/account/SessionsCard.vue'
import TotpCard from '@/components/account/TotpCard.vue'
import { useAuthStore } from '@/stores/auth'
import { describeError } from '@/stores/notify'

const props = defineProps<{ tab?: string }>()

const auth = useAuthStore()
const api = useAuthApi()
const router = useRouter()

const account = ref<AccountInfo | null>(null)
const error = ref('')

const current = computed({
  get: () => props.tab || 'profile',
  set: (tab: string) => void router.replace({ name: 'account', params: { tab } }),
})

/** Reloads the account after a change; the shell's user (name, colour, 2FA state) follows. */
async function load(): Promise<void> {
  try {
    account.value = await api.account()
    error.value = ''
    auth.setUser(account.value)
  } catch (e) {
    error.value = describeError(e)
  }
}

onMounted(load)
</script>

<template>
  <v-container class="account-view" max-width="820">
    <h1 class="text-h5 mb-4">Account</h1>
    <v-alert
      v-if="auth.secondFactorSetupRequired"
      type="warning"
      variant="tonal"
      class="mb-4"
      data-testid="2fa-required"
    >
      This server requires a second factor. Add a passkey or an authenticator app, then you can
      continue to the wiki.
    </v-alert>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <v-tabs v-model="current" show-arrows class="mb-4" aria-label="Account sections">
      <v-tab value="profile" :prepend-icon="mdiAccount" :disabled="auth.secondFactorSetupRequired">
        Profile
      </v-tab>
      <v-tab value="security" :prepend-icon="mdiShieldLock">Security</v-tab>
      <v-tab value="sessions" :prepend-icon="mdiDevices" :disabled="auth.secondFactorSetupRequired">
        Devices
      </v-tab>
    </v-tabs>

    <!-- the device list loads on its own and does not need the account details -->
    <div v-if="current === 'sessions'" class="d-flex flex-column ga-4">
      <SessionsCard />
    </div>
    <template v-else-if="account">
      <div v-if="current === 'profile'" class="d-flex flex-column ga-4">
        <ProfileCard :account="account" @changed="load" />
      </div>
      <div v-else class="d-flex flex-column ga-4">
        <PasswordCard :account="account" @changed="load" />
        <PasskeysCard :account="account" @changed="load" />
        <TotpCard :account="account" @changed="load" />
      </div>
    </template>
    <div v-else-if="!error" class="d-flex justify-center pa-8">
      <v-progress-circular indeterminate aria-label="Loading" />
    </div>
  </v-container>
</template>
