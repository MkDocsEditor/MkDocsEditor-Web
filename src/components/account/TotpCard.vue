<script setup lang="ts">
import { mdiShieldCheck, mdiShieldKey } from '@mdi/js'
import { ref } from 'vue'

import { useAuthApi } from '@/api'
import type { AccountInfo, TotpEnrollment } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import CopyField from '@/components/auth/CopyField.vue'
import QrCode from '@/components/auth/QrCode.vue'
import RecoveryCodes from '@/components/auth/RecoveryCodes.vue'
import { totpRule } from '@/services/accountRules'
import { describeAuthError } from '@/services/authErrors'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

const props = defineProps<{ account: AccountInfo }>()
const emit = defineEmits<{ changed: [] }>()

const api = useAuthApi()
const reauth = useReauthStore()
const notify = useNotifyStore()

const enrollment = ref<TotpEnrollment | null>(null)
const code = ref('')
const busy = ref(false)
const error = ref('')
/** Shown once after enrolling or regenerating. */
/** The codes on screen come from a new enrollment (not from regenerating them). */
const justEnabled = ref(false)
const codes = ref<string[] | null>(null)
const confirmDisable = ref(false)
const confirmRegenerate = ref(false)

/** The secret in groups of four, easier to type. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

async function begin(): Promise<void> {
  busy.value = true
  error.value = ''
  codes.value = null
  try {
    enrollment.value = await reauth.run(() => api.totpBegin())
    code.value = ''
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busy.value = false
  }
}

function hideCodes(): void {
  codes.value = null
  justEnabled.value = false
}

async function confirm(): Promise<void> {
  if (totpRule(code.value) !== true || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api.totpConfirm(code.value.replace(/\s/g, ''))
    codes.value = result.recoveryCodes
    justEnabled.value = true
    enrollment.value = null
    // no toast: the recovery codes show that it worked, and a snackbar would cover the button
    // below them on phones
    emit('changed')
  } catch (e) {
    error.value = describeAuthError(e) ?? String(e)
  } finally {
    busy.value = false
  }
}

async function disable(): Promise<void> {
  busy.value = true
  try {
    await reauth.run(() => api.totpDisable())
    codes.value = null
    notify.success('Authenticator app removed')
    emit('changed')
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busy.value = false
  }
}

async function regenerate(): Promise<void> {
  busy.value = true
  try {
    codes.value = (await reauth.run(() => api.regenerateRecoveryCodes())).recoveryCodes
    emit('changed')
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-card data-testid="totp-card">
    <v-card-item>
      <v-card-title>Authenticator app (TOTP)</v-card-title>
      <template #append>
        <v-chip
          v-if="props.account.totpEnabled"
          color="success"
          :prepend-icon="mdiShieldCheck"
          size="small"
          data-testid="totp-status"
        >
          on
        </v-chip>
        <v-chip v-else size="small" data-testid="totp-status">off</v-chip>
      </template>
    </v-card-item>
    <v-card-text>
      <!-- recovery codes, shown once -->
      <template v-if="codes">
        <v-alert v-if="justEnabled" type="success" variant="tonal" density="compact" class="mb-3">
          The authenticator app is set up.
        </v-alert>
        <h3 class="text-subtitle-1 mb-2">Your recovery codes</h3>
        <RecoveryCodes :codes="codes" :username="account.username" />
        <v-btn class="mt-3" variant="text" @click="hideCodes">I have saved them</v-btn>
      </template>

      <!-- enrolling -->
      <template v-else-if="enrollment">
        <ol class="steps">
          <li>
            Scan the QR code with your authenticator app or password manager (for example Bitwarden,
            Aegis, Google Authenticator).
          </li>
        </ol>
        <div class="d-flex flex-wrap ga-4 align-start my-3">
          <QrCode :value="enrollment.otpauthUri" label="QR code for the authenticator app" />
          <div class="flex-grow-1 d-flex flex-column ga-3" style="min-width: 220px">
            <CopyField
              :value="grouped(enrollment.secret)"
              label="Key for typing in"
              testid="totp-secret"
            />
            <CopyField :value="enrollment.otpauthUri" label="otpauth link" testid="totp-uri" />
            <a :href="enrollment.otpauthUri" class="text-body-2">Open in an app on this device</a>
          </div>
        </div>
        <v-form data-testid="totp-confirm-form" @submit.prevent="confirm">
          <p class="mb-2">To confirm, enter the current code from the app:</p>
          <input
            type="text"
            name="username"
            autocomplete="username"
            :value="account.username"
            hidden
            readonly
          />
          <v-text-field
            v-model="code"
            label="Code from the app"
            name="otp"
            autocomplete="one-time-code"
            inputmode="numeric"
            :prepend-inner-icon="mdiShieldKey"
            :rules="[totpRule]"
            :disabled="busy"
            autofocus
            data-testid="totp-confirm-code"
          />
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            density="compact"
            role="alert"
            class="mb-3"
          >
            {{ error }}
          </v-alert>
          <div class="d-flex ga-2">
            <v-btn variant="text" @click="enrollment = null">Cancel</v-btn>
            <v-spacer />
            <v-btn
              type="submit"
              color="primary"
              variant="flat"
              :loading="busy"
              :disabled="totpRule(code) !== true"
            >
              Confirm
            </v-btn>
          </div>
        </v-form>
      </template>

      <template v-else-if="account.totpEnabled">
        <p data-testid="recovery-left">
          {{ account.recoveryCodesLeft }} of 10 recovery codes left.
        </p>
        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn
            variant="tonal"
            :disabled="busy"
            data-testid="totp-regenerate"
            @click="confirmRegenerate = true"
          >
            New recovery codes
          </v-btn>
          <v-btn
            variant="tonal"
            color="error"
            :disabled="busy"
            data-testid="totp-disable"
            @click="confirmDisable = true"
          >
            Remove
          </v-btn>
        </div>
      </template>

      <template v-else>
        <p>A code from an app as a second step after the password.</p>
        <v-btn
          class="mt-3"
          color="primary"
          variant="tonal"
          :loading="busy"
          data-testid="totp-enroll"
          @click="begin"
        >
          Set up
        </v-btn>
      </template>
    </v-card-text>

    <ConfirmDialog
      v-model="confirmDisable"
      title="Remove the authenticator app?"
      text="Afterwards the password alone signs you in again. The recovery codes stop working."
      confirm-text="Remove"
      danger
      @confirm="disable"
    />
    <ConfirmDialog
      v-model="confirmRegenerate"
      title="New recovery codes?"
      text="The current codes stop working."
      confirm-text="New codes"
      @confirm="regenerate"
    />
  </v-card>
</template>

<style scoped>
.steps {
  padding-left: 1.2rem;
}
</style>
