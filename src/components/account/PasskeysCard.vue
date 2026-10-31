<script setup lang="ts">
import { mdiDelete, mdiFingerprint, mdiPencil, mdiPlus } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import type { AccountInfo, Passkey } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { formatTime } from '@/services/accountRules'
import { addPasskey } from '@/services/addPasskey'
import { describeAuthError } from '@/services/authErrors'
import { describePasskeyError, isPasskeyCancel, passkeysSupported } from '@/services/passkeys'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

defineProps<{ account: AccountInfo }>()
const emit = defineEmits<{ changed: [] }>()

const api = useAuthApi()
const auth = useAuthStore()
const reauth = useReauthStore()
const notify = useNotifyStore()

const passkeys = ref<Passkey[]>([])
const loading = ref(true)
const busy = ref(false)
const renaming = ref<Passkey | null>(null)
const newName = ref('')
const deleting = ref<Passkey | null>(null)

const available = computed(() => auth.passkeysEnabled && passkeysSupported())

async function load(): Promise<void> {
  try {
    passkeys.value = await api.passkeys()
  } catch (e) {
    notify.error(e, 'Could not load the passkeys')
  } finally {
    loading.value = false
  }
}

async function add(): Promise<void> {
  busy.value = true
  try {
    await addPasskey()
    notify.success('Passkey added')
    await load()
    emit('changed')
  } catch (e) {
    if (e instanceof ReauthCancelled || isPasskeyCancel(e)) return
    notify.error(describeAuthError(e) ?? describePasskeyError(e))
  } finally {
    busy.value = false
  }
}

function startRename(passkey: Passkey): void {
  renaming.value = passkey
  newName.value = passkey.name
}

async function rename(): Promise<void> {
  const passkey = renaming.value
  const name = newName.value.trim()
  if (!passkey || !name) return
  renaming.value = null
  try {
    await api.renamePasskey(passkey.id, name)
    await load()
  } catch (e) {
    notify.error(e, 'Rename failed')
  }
}

async function remove(passkey: Passkey): Promise<void> {
  busy.value = true
  try {
    await reauth.run(() => api.deletePasskey(passkey.id))
    notify.success('Passkey removed')
    await load()
    emit('changed')
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <v-card data-testid="passkeys-card">
    <v-card-item>
      <v-card-title>Passkeys</v-card-title>
      <v-card-subtitle>Sign in with fingerprint, face, PIN or password manager</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-alert v-if="!auth.passkeysEnabled" type="info" variant="tonal" density="compact">
        Passkeys are not set up on this server.
      </v-alert>
      <v-alert v-else-if="!passkeysSupported()" type="info" variant="tonal" density="compact">
        This browser does not support passkeys.
      </v-alert>
      <v-progress-linear v-if="loading" indeterminate />
      <v-list v-else-if="passkeys.length" density="comfortable" data-testid="passkey-list">
        <v-list-item
          v-for="passkey in passkeys"
          :key="passkey.id"
          :prepend-icon="mdiFingerprint"
          :title="passkey.name"
          :subtitle="`Added ${formatTime(passkey.createdAt)} · last used ${formatTime(passkey.lastUsedAt)}`"
        >
          <template #append>
            <v-btn
              :icon="mdiPencil"
              variant="text"
              size="small"
              :aria-label="`Rename ${passkey.name}`"
              @click="startRename(passkey)"
            />
            <v-btn
              :icon="mdiDelete"
              variant="text"
              size="small"
              :aria-label="`Remove ${passkey.name}`"
              :disabled="busy"
              @click="deleting = passkey"
            />
          </template>
        </v-list-item>
      </v-list>
      <p v-else class="text-medium-emphasis">No passkeys yet.</p>
    </v-card-text>
    <v-card-actions v-if="available">
      <v-spacer />
      <v-btn
        :prepend-icon="mdiPlus"
        color="primary"
        variant="tonal"
        :loading="busy"
        data-testid="passkey-add"
        @click="add"
      >
        Add a passkey
      </v-btn>
    </v-card-actions>

    <v-dialog
      :model-value="renaming !== null"
      max-width="420"
      @update:model-value="renaming = null"
    >
      <v-card title="Rename passkey">
        <v-form @submit.prevent="rename">
          <v-card-text>
            <v-text-field
              v-model="newName"
              label="Name"
              autofocus
              :rules="[(v: string) => (v.trim() !== '' && v.length <= 64) || '1 to 64 characters']"
              data-testid="passkey-name"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="renaming = null">Cancel</v-btn>
            <v-btn type="submit" color="primary" variant="flat" :disabled="!newName.trim()">
              Save
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
    <ConfirmDialog
      :model-value="deleting !== null"
      title="Remove the passkey?"
      :text="`“${deleting?.name}” can no longer sign you in. Delete it in the password manager or on the device too.`"
      confirm-text="Remove"
      danger
      @update:model-value="(open: boolean) => !open && (deleting = null)"
      @confirm="deleting && remove(deleting)"
    />
  </v-card>
</template>
