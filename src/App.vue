<script setup lang="ts">
import { mdiAccountCircle, mdiLogout } from '@mdi/js'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function logout(): Promise<void> {
  auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <v-app-bar-title>MkDocsEditor</v-app-bar-title>
      <template v-if="auth.isLoggedIn && !auth.anonymous" #append>
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" :icon="mdiAccountCircle" aria-label="Konto" />
          </template>
          <v-list density="compact">
            <v-list-item :title="auth.username" subtitle="angemeldet" />
            <v-divider />
            <v-list-item :prepend-icon="mdiLogout" title="Abmelden" @click="logout" />
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
