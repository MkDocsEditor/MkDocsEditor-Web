<script setup lang="ts">
import { mdiCellphone, mdiLaptop, mdiLogout } from '@mdi/js'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthApi } from '@/api'
import type { SessionInfo } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { formatTime } from '@/services/time'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'

const api = useAuthApi()
const auth = useAuthStore()
const notify = useNotifyStore()
const router = useRouter()

const sessions = ref<SessionInfo[]>([])
const loading = ref(true)
const busy = ref(false)
const confirmOthers = ref(false)

function isPhone(session: SessionInfo): boolean {
  return /android|iphone|ipad|mobile/i.test(`${session.deviceName} ${session.userAgent ?? ''}`)
}

async function load(): Promise<void> {
  try {
    sessions.value = await api.sessions()
  } catch (e) {
    notify.error(e, 'Could not load the devices')
  } finally {
    loading.value = false
  }
}

async function revoke(session: SessionInfo): Promise<void> {
  busy.value = true
  try {
    if (session.current) {
      await auth.logout()
      await router.push({ name: 'login' })
      return
    }
    await api.revokeSession(session.id)
    notify.success(`Signed out ${session.deviceName}`)
    await load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

async function revokeOthers(): Promise<void> {
  busy.value = true
  try {
    const { revoked } = await api.revokeOtherSessions()
    notify.success(revoked === 1 ? 'Signed out 1 device' : `Signed out ${revoked} devices`)
    await load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <v-card data-testid="sessions-card">
    <v-card-item>
      <v-card-title>Signed-in devices</v-card-title>
      <v-card-subtitle>Sign out devices you do not know or no longer have.</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-progress-linear v-if="loading" indeterminate />
      <v-list v-else lines="three" data-testid="session-list">
        <v-list-item
          v-for="session in sessions"
          :key="session.id"
          :prepend-icon="isPhone(session) ? mdiCellphone : mdiLaptop"
          :data-testid="session.current ? 'session-current' : 'session-other'"
        >
          <v-list-item-title>
            {{ session.deviceName || 'Unknown device' }}
            <v-chip v-if="session.current" size="x-small" color="primary" class="ml-1">
              this device
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>
            Last active {{ formatTime(session.lastUsedAt ?? session.createdAt) }}
            <span v-if="session.ip"> · {{ session.ip }}</span>
            <br />
            Signed in {{ formatTime(session.createdAt) }}
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              :prepend-icon="mdiLogout"
              variant="text"
              size="small"
              :disabled="busy"
              :aria-label="`Sign out ${session.deviceName}`"
              @click="revoke(session)"
            >
              Sign out
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-actions v-if="sessions.length > 1">
      <v-spacer />
      <v-btn
        color="error"
        variant="tonal"
        :disabled="busy"
        data-testid="revoke-others"
        @click="confirmOthers = true"
      >
        Sign out all others
      </v-btn>
    </v-card-actions>
    <ConfirmDialog
      v-model="confirmOthers"
      title="Sign out all other devices?"
      text="Only this device stays signed in."
      confirm-text="Sign out"
      danger
      @confirm="revokeOthers"
    />
  </v-card>
</template>
