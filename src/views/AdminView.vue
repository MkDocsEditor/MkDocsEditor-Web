<script setup lang="ts">
import { mdiAccountClock, mdiAccountGroup, mdiCog, mdiEmailPlus, mdiHistory } from '@mdi/js'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import PageHeader from '@/components/common/PageHeader.vue'
import AccessRequestsAdmin from '@/components/admin/AccessRequestsAdmin.vue'
import AuditAdmin from '@/components/admin/AuditAdmin.vue'
import InvitesAdmin from '@/components/admin/InvitesAdmin.vue'
import SettingsAdmin from '@/components/admin/SettingsAdmin.vue'
import UsersAdmin from '@/components/admin/UsersAdmin.vue'
import { useLiveStore } from '@/stores/live'

const props = defineProps<{ tab?: string }>()
const router = useRouter()
const live = useLiveStore()

const current = computed({
  get: () => props.tab || 'users',
  set: (tab: string) => void router.replace({ name: 'admin', params: { tab } }),
})
</script>

<template>
  <v-container>
    <PageHeader title="Admin" />
    <v-tabs v-model="current" show-arrows class="mb-4" aria-label="Admin sections">
      <v-tab value="users" :prepend-icon="mdiAccountGroup">Users</v-tab>
      <v-tab value="invites" :prepend-icon="mdiEmailPlus">Invites</v-tab>
      <v-tab value="requests" :prepend-icon="mdiAccountClock" data-testid="tab-requests">
        Requests
        <v-chip v-if="live.pendingAccessRequests > 0" size="x-small" class="ms-2">
          {{ live.pendingAccessRequests }}
        </v-chip>
      </v-tab>
      <v-tab value="audit" :prepend-icon="mdiHistory">Audit log</v-tab>
      <v-tab value="settings" :prepend-icon="mdiCog">Settings</v-tab>
    </v-tabs>
    <UsersAdmin v-if="current === 'users'" />
    <InvitesAdmin v-else-if="current === 'invites'" />
    <AccessRequestsAdmin v-else-if="current === 'requests'" />
    <AuditAdmin v-else-if="current === 'audit'" />
    <SettingsAdmin v-else />
  </v-container>
</template>
