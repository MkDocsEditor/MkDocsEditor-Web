<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import AuthCard from '@/components/auth/AuthCard.vue'
import PasskeyStep from '@/components/auth/PasskeyStep.vue'
import { useNotifyStore } from '@/stores/notify'
import { useAuthStore } from '@/stores/auth'

/** The passkey step after a password login, before going on to where the user wanted to go. */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const notify = useNotifyStore()

function target(): string {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}

async function created(): Promise<void> {
  notify.success('Passkey created. Next time, pick it when you sign in.')
  await router.replace(target())
}
</script>

<template>
  <AuthCard title="Signed in" :subtitle="auth.displayName">
    <PasskeyStep :username="auth.username" @created="created" @later="router.replace(target())" />
  </AuthCard>
</template>
