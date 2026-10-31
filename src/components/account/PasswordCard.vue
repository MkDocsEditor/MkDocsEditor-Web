<script setup lang="ts">
import { computed, ref } from 'vue'

import { ApiError, useAuthApi } from '@/api'
import type { AccountInfo } from '@/api'
import PasswordField from '@/components/auth/PasswordField.vue'
import { passwordRule, sameAsRule } from '@/services/accountRules'
import { describeAuthError } from '@/services/authErrors'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

const props = defineProps<{ account: AccountInfo }>()
const emit = defineEmits<{ changed: [] }>()

const api = useAuthApi()
const auth = useAuthStore()
const reauth = useReauthStore()
const notify = useNotifyStore()

const form = ref<{ reset: () => void } | null>(null)
const current = ref('')
const next = ref('')
const next2 = ref('')
const valid = ref(false)
const busy = ref(false)
const error = ref('')

const nextRules = computed(() => [passwordRule(auth.passwordPolicy)])
const next2Rules = [sameAsRule(() => next.value)]

async function save(): Promise<void> {
  if (!valid.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (props.account.hasPassword) {
      // the current password is the confirmation, no extra step-up
      await api.changePassword(next.value, current.value)
    } else {
      await reauth.run(() => api.changePassword(next.value))
    }
    form.value?.reset()
    notify.success('Password changed. Other devices are signed out.')
    emit('changed')
  } catch (e) {
    if (e instanceof ReauthCancelled) return
    error.value =
      e instanceof ApiError && e.code === 'invalid-credentials'
        ? 'The current password is wrong.'
        : (describeAuthError(e) ?? String(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-card
    :title="account.hasPassword ? 'Change password' : 'Set a password'"
    data-testid="password-card"
  >
    <v-form ref="form" v-model="valid" data-testid="password-form" @submit.prevent="save">
      <v-card-text>
        <p v-if="!account.hasPassword" class="mb-4">
          You sign in with a passkey only. A password is a second way in.
        </p>
        <!-- so password managers update the right entry -->
        <input
          type="text"
          name="username"
          autocomplete="username"
          :value="account.username"
          hidden
          readonly
        />
        <PasswordField
          v-if="account.hasPassword"
          v-model="current"
          label="Current password"
          name="current-password"
          autocomplete="current-password"
          :rules="[(v: string) => v !== '' || 'Please enter the current password']"
          :disabled="busy"
          data-testid="current-password"
        />
        <PasswordField
          v-model="next"
          label="New password"
          name="new-password"
          autocomplete="new-password"
          :rules="nextRules"
          :hint="`At least ${auth.passwordPolicy.minLength} characters`"
          :disabled="busy"
          data-testid="new-password"
        />
        <PasswordField
          v-model="next2"
          label="Repeat the new password"
          name="new-password-repeat"
          autocomplete="new-password"
          :rules="next2Rules"
          :disabled="busy"
          class="mt-2"
          data-testid="new-password-repeat"
        />
        <v-alert v-if="error" type="error" variant="tonal" density="compact" role="alert">
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn type="submit" color="primary" variant="flat" :loading="busy" :disabled="!valid">
          Save password
        </v-btn>
      </v-card-actions>
    </v-form>
  </v-card>
</template>
