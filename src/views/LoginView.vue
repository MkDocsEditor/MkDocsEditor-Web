<script setup lang="ts">
import { mdiAccount, mdiEye, mdiEyeOff, mdiLock } from '@mdi/js'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import { getConfig } from '@/services/config'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref(auth.username)
const password = ref('')
const remember = ref(true)
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value, remember.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect.startsWith('/') ? redirect : '/')
  } catch (e) {
    if (e instanceof ApiError && e.isUnauthorized) {
      error.value = 'Benutzername oder Passwort stimmt nicht.'
    } else if (e instanceof ApiError && e.isNetworkError) {
      error.value = `Der Server ist nicht erreichbar (${getConfig().backendUrl}).`
    } else {
      error.value = e instanceof Error ? e.message : String(e)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height justify-center">
    <v-card width="100%" max-width="420" elevation="4" class="pa-2">
      <v-card-item class="text-center">
        <v-img src="/logo.png" width="72" height="72" class="mx-auto mb-2" alt="" />
        <v-card-title class="text-h5">Anmelden</v-card-title>
        <v-card-subtitle>Familien-Wiki bearbeiten</v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <v-form data-testid="login-form" @submit.prevent="submit">
          <v-text-field
            v-model="username"
            label="Benutzername"
            name="username"
            autocomplete="username"
            autocapitalize="none"
            :prepend-inner-icon="mdiAccount"
            :disabled="loading"
            autofocus
          />
          <v-text-field
            v-model="password"
            label="Passwort"
            name="password"
            autocomplete="current-password"
            :type="showPassword ? 'text' : 'password'"
            :prepend-inner-icon="mdiLock"
            :append-inner-icon="showPassword ? mdiEyeOff : mdiEye"
            :disabled="loading"
            @click:append-inner="showPassword = !showPassword"
          />
          <v-checkbox
            v-model="remember"
            label="Angemeldet bleiben"
            density="compact"
            hide-details
          />
          <v-alert v-if="error" type="error" variant="tonal" class="my-3" data-testid="login-error">
            {{ error }}
          </v-alert>
          <v-btn
            type="submit"
            color="primary"
            size="large"
            block
            class="mt-4"
            :loading="loading"
            :disabled="!username || !password"
          >
            Anmelden
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-container>
</template>
