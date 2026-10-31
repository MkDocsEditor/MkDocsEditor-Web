<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AndroidAppHint from '@/components/auth/AndroidAppHint.vue'
import AuthCard from '@/components/auth/AuthCard.vue'
import PasskeyStep from '@/components/auth/PasskeyStep.vue'
import { useAndroidHint } from '@/services/androidHint'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'

/**
 * After a password login, before going on to where the user wanted to go: the passkey step
 * (`?passkey=1`) and, on a phone, the hint for the Android app (`?app=1`).
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const notify = useNotifyStore()
const androidHintWanted = useAndroidHint()

const passkeyOpen = ref(route.query.passkey === '1')
const appOpen = ref(route.query.app === '1' && androidHintWanted())
const nothingLeft = computed(() => !passkeyOpen.value && !appOpen.value)

function target(): string {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}

async function next(): Promise<void> {
  if (nothingLeft.value) await router.replace(target())
}

async function passkeyCreated(): Promise<void> {
  notify.success('Passkey created. Next time, pick it when you sign in.')
  passkeyOpen.value = false
  await next()
}

async function passkeyLater(): Promise<void> {
  passkeyOpen.value = false
  await next()
}

async function appDismissed(): Promise<void> {
  appOpen.value = false
  await next()
}

if (nothingLeft.value) void router.replace(target())
</script>

<template>
  <AuthCard title="Signed in" :subtitle="auth.displayName">
    <PasskeyStep
      v-if="passkeyOpen"
      :username="auth.username"
      @created="passkeyCreated"
      @later="passkeyLater"
    />
    <v-divider v-if="passkeyOpen && appOpen" class="my-6" />
    <AndroidAppHint v-if="appOpen" @dismissed="appDismissed" />
  </AuthCard>
</template>
