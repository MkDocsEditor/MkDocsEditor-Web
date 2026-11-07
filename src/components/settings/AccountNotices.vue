<script setup lang="ts">
import { mdiFingerprint } from '@mdi/js'
import { computed, ref } from 'vue'

import type { AccountInfo } from '@/api'
import { describeAuthError } from '@/services/authErrors'
import {
  passkeyReminderDue,
  passkeyReminderSkipped,
  snoozePasskeyReminder,
} from '@/services/passkeyReminder'
import { describePasskeyError, isPasskeyCancel, passkeysSupported } from '@/services/passkeys'
import { addPasskey } from '@/stores/addPasskey'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled } from '@/stores/reauth'

/** What the account sections say first: a required second factor, or the passkey reminder. */
const props = defineProps<{ account: AccountInfo | null }>()
const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()

/**
 * After "Later" on the passkey step: a reminder here, at most every few days. Closing it
 * pauses it again.
 */
const reminderHidden = ref(false)
const reminderBusy = ref(false)
const showPasskeyReminder = computed(
  () =>
    !reminderHidden.value &&
    props.account?.passkeyCount === 0 &&
    auth.passkeysEnabled &&
    passkeysSupported() &&
    passkeyReminderSkipped(props.account.username) &&
    passkeyReminderDue(props.account.username),
)

function dismissReminder(): void {
  if (props.account) snoozePasskeyReminder(props.account.username)
  reminderHidden.value = true
}

async function createFromReminder(): Promise<void> {
  reminderBusy.value = true
  try {
    await addPasskey()
    reminderHidden.value = true
    useNotifyStore().success('Passkey created. Next time, pick it when you sign in.')
    emit('changed')
  } catch (e) {
    if (e instanceof ReauthCancelled || isPasskeyCancel(e)) return
    useNotifyStore().error(describeAuthError(e) ?? describePasskeyError(e))
  } finally {
    reminderBusy.value = false
  }
}
</script>

<template>
  <v-alert
    v-if="auth.secondFactorSetupRequired"
    type="warning"
    class="mb-4"
    data-testid="2fa-required"
  >
    This server requires a second factor. Add a passkey or an authenticator app, then you can
    continue to the wiki.
  </v-alert>
  <v-alert
    v-if="showPasskeyReminder"
    type="info"
    class="mb-4"
    :icon="mdiFingerprint"
    title="Sign in with a passkey next time"
    closable
    close-label="Remind me later"
    data-testid="passkey-reminder"
    @click:close="dismissReminder"
  >
    You have no passkey yet. With one, you confirm with your fingerprint, face or screen lock
    instead of typing the password. Password managers like Bitwarden can store it.
    <div class="mt-4">
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        :loading="reminderBusy"
        data-testid="passkey-reminder-create"
        @click="createFromReminder"
      >
        Create passkey
      </v-btn>
    </div>
  </v-alert>
</template>
