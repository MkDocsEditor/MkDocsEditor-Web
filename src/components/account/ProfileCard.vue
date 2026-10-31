<script setup lang="ts">
import { ref, watch } from 'vue'

import { useAuthApi } from '@/api'
import type { AccountInfo, AccountPatch } from '@/api'
import { colorRule, displayNameRule, roleLabel, usernameRule } from '@/services/accountRules'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

const props = defineProps<{ account: AccountInfo }>()
const emit = defineEmits<{ changed: [] }>()

const api = useAuthApi()
const reauth = useReauthStore()
const notify = useNotifyStore()

const username = ref('')
const displayName = ref('')
const color = ref('')
const email = ref('')
const valid = ref(false)
const busy = ref(false)

watch(
  () => props.account,
  (a) => {
    username.value = a.username
    displayName.value = a.displayName
    color.value = a.color
    email.value = a.email ?? ''
  },
  { immediate: true },
)

async function save(): Promise<void> {
  if (!valid.value) return
  const patch: AccountPatch = {}
  if (displayName.value.trim() !== props.account.displayName)
    patch.displayName = displayName.value.trim()
  if (color.value !== props.account.color) patch.color = color.value
  if (email.value.trim() !== (props.account.email ?? '')) patch.email = email.value.trim()
  if (username.value.trim() !== props.account.username) patch.username = username.value.trim()
  if (Object.keys(patch).length === 0) return
  busy.value = true
  try {
    // a new username needs a recent authentication
    await reauth.run(() => api.updateAccount(patch))
    notify.success('Profile saved')
    emit('changed')
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e, 'Could not save')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-card title="Profile" data-testid="profile-card">
    <v-form v-model="valid" @submit.prevent="save">
      <v-card-text>
        <p class="mb-4 text-medium-emphasis">Role: {{ roleLabel(account.role) }}</p>
        <v-text-field
          v-model="displayName"
          label="Display name"
          name="name"
          autocomplete="name"
          :rules="[(v: string) => v.trim() !== '' || 'Please enter a name', displayNameRule]"
          data-testid="profile-display-name"
        />
        <v-text-field
          v-model="username"
          label="Username"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          hint="For signing in. Your old name stays reserved for you."
          persistent-hint
          class="mb-2"
          :rules="[usernameRule]"
        />
        <div class="d-flex align-center ga-3">
          <v-text-field
            v-model="color"
            label="Colour"
            hint="For your cursor and your text in “Who wrote what?”"
            persistent-hint
            :rules="[colorRule]"
            data-testid="profile-color"
          >
            <template #prepend-inner>
              <span class="swatch" :style="{ background: color }" aria-hidden="true" />
            </template>
          </v-text-field>
          <input v-model="color" type="color" class="color-input" aria-label="Pick a colour" />
        </div>
        <v-text-field
          v-model="email"
          label="Email for git (optional)"
          name="email"
          type="email"
          autocomplete="email"
          hint="Only as the author in the version history. No mail is ever sent."
          persistent-hint
          class="mt-2"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn type="submit" color="primary" variant="flat" :loading="busy" :disabled="!valid">
          Save
        </v-btn>
      </v-card-actions>
    </v-form>
  </v-card>
</template>

<style scoped>
.swatch {
  display: inline-block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.color-input {
  width: 48px;
  height: 48px;
  border: none;
  background: none;
  cursor: pointer;
  margin-bottom: 22px;
}
</style>
