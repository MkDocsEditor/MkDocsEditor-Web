<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import { useAuthApi } from '@/api'
import type { AuditEvent } from '@/api'
import LoadError from '@/components/common/LoadError.vue'
import { useLoad } from '@/composables/useLoad'
import { formatTime } from '@/services/time'

const api = useAuthApi()

const events = ref<AuditEvent[]>([])
const next = ref<number | null>(null)
const type = ref<string | null>(null)

/** Readable names of the audit event types (`docs/auth.md` section 2). */
const TYPES: Record<string, string> = {
  'login.succeeded': 'Signed in',
  'login.failed': 'Sign-in failed',
  'login.second-factor-failed': 'Wrong second factor',
  logout: 'Signed out',
  'session.revoked': 'Device signed out',
  'reauth.succeeded': 'Confirmed identity',
  'reauth.failed': 'Identity confirmation failed',
  'password.changed': 'Password changed',
  'password.removed': 'Password removed',
  'totp.enabled': 'Authenticator app set up',
  'totp.disabled': 'Authenticator app removed',
  'recovery-codes.generated': 'Recovery codes generated',
  'recovery-code.used': 'Recovery code used',
  'passkey.added': 'Passkey added',
  'passkey.renamed': 'Passkey renamed',
  'passkey.removed': 'Passkey removed',
  'app-token.created': 'App token created',
  'app-token.revoked': 'App token revoked',
  'oauth.client-registered': 'OAuth app registered',
  'oauth.approved': 'OAuth app allowed',
  'oauth.denied': 'OAuth app refused',
  'setup.link-created': 'Setup link created',
  'setup.completed': 'Setup completed',
  'invite.created': 'Invite created',
  'invite.revoked': 'Invite revoked',
  'invite.redeemed': 'Invite accepted',
  'reset.created': 'Reset link created',
  'reset.revoked': 'Reset link revoked',
  'reset.redeemed': 'Account reset',
  'account.created': 'Account created',
  'account.imported': 'Account imported',
  'account.updated': 'Account changed',
  'account.role-changed': 'Role changed',
  'account.disabled': 'Account disabled',
  'account.enabled': 'Account enabled',
  'account.deleted': 'Account deleted',
  'settings.changed': 'Settings changed',
  'rate-limit.triggered': 'Too many attempts',
}
const typeItems = Object.entries(TYPES).map(([value, title]) => ({ value, title }))

function isWarning(event: AuditEvent): boolean {
  return /failed|rate-limit|disabled|deleted/.test(event.type)
}

function detailText(event: AuditEvent): string {
  if (!event.details) return ''
  return Object.entries(event.details)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ')
}

const { loading, loadError, load } = useLoad<[more?: boolean]>({
  failure: 'Could not load the audit log',
  hasData: (more) => more === true || events.value.length > 0,
  fetch: async (more) => {
    const page = await api.audit({
      limit: 100,
      before: more ? (next.value ?? undefined) : undefined,
      type: type.value ?? undefined,
    })
    events.value = more ? [...events.value, ...page.events] : page.events
    next.value = page.next
  },
  alwaysShowProgress: true,
})

watch(type, () => void load())
onMounted(() => void load())
</script>

<template>
  <v-card data-testid="audit-admin">
    <v-card-item>
      <v-card-title>Audit log</v-card-title>
      <v-card-subtitle>Sign-ins and account changes</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-autocomplete
        v-model="type"
        :items="typeItems"
        label="Only this event"
        clearable
        hide-details
        class="mb-2"
      />
    </v-card-text>
    <v-card-text v-if="loadError">
      <LoadError title="Could not load the audit log" :error="loadError" @retry="load()" />
    </v-card-text>
    <v-list lines="three">
      <v-list-item v-for="event in events" :key="event.id" data-testid="audit-event">
        <v-list-item-title :class="{ 'text-error': isWarning(event) }">
          {{ TYPES[event.type] ?? event.type }}
          <span v-if="event.target" class="text-medium-emphasis"
            >· {{ event.target.username }}</span
          >
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ formatTime(event.time) }}
          <template v-if="event.actor"> · by {{ event.actor.username }}</template>
          <template v-if="event.ip"> · {{ event.ip }}</template>
          <template v-if="detailText(event)"><br />{{ detailText(event) }}</template>
        </v-list-item-subtitle>
      </v-list-item>
      <v-list-item v-if="!loading && !loadError && events.length === 0" title="No entries" />
    </v-list>
    <v-progress-linear v-if="loading" indeterminate />
    <v-card-actions v-if="next !== null">
      <v-spacer />
      <v-btn :loading="loading" @click="load(true)">Load older</v-btn>
    </v-card-actions>
  </v-card>
</template>
