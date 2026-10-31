<script setup lang="ts">
import { mdiAccountPlus } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import { ROLES } from '@/api/authTypes'
import type { CreatedLink, LinkInfo, Role } from '@/api'
import LinkResultDialog from '@/components/admin/LinkResultDialog.vue'
import LinkStatusChip from '@/components/admin/LinkStatusChip.vue'
import { formatTime, roleLabel } from '@/services/accountRules'
import { useNotifyStore } from '@/stores/notify'

const api = useAuthApi()
const notify = useNotifyStore()

const invites = ref<LinkInfo[]>([])
const loading = ref(true)
const showAll = ref(false)

const role = ref<Role>('editor')
const hours = ref(168)
const note = ref('')
const busy = ref(false)
const created = ref<CreatedLink | null>(null)

const roleItems = ROLES.map((value) => ({ value, title: roleLabel(value) }))
const expiryItems = [
  { value: 24, title: '1 day' },
  { value: 72, title: '3 days' },
  { value: 168, title: '7 days' },
  { value: 720, title: '30 days' },
]

const visible = computed(() => invites.value.filter((i) => showAll.value || i.status === 'pending'))

async function load(): Promise<void> {
  try {
    invites.value = await api.invites()
  } catch (e) {
    notify.error(e, 'Could not load the invites')
  } finally {
    loading.value = false
  }
}

async function create(): Promise<void> {
  busy.value = true
  try {
    created.value = await api.createInvite({
      role: role.value,
      expiresInHours: hours.value,
      note: note.value.trim() || undefined,
    })
    note.value = ''
    await load()
  } catch (e) {
    notify.error(e, 'Could not create the invite')
  } finally {
    busy.value = false
  }
}

async function revoke(invite: LinkInfo): Promise<void> {
  try {
    await api.revokeInvite(invite.id)
    notify.success('Invite revoked')
    await load()
  } catch (e) {
    notify.error(e)
  }
}

onMounted(load)
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-card title="New invite" data-testid="invite-create">
      <v-form @submit.prevent="create">
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-select v-model="role" :items="roleItems" label="Role" data-testid="invite-role" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="hours" :items="expiryItems" label="Valid for" />
            </v-col>
          </v-row>
          <v-text-field
            v-model="note"
            label="Note (optional)"
            hint="The invited person sees it too, for example “for Anna”"
            persistent-hint
            counter="200"
            :rules="[(v: string) => v.length <= 200 || 'At most 200 characters']"
            data-testid="invite-note"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            :prepend-icon="mdiAccountPlus"
            :loading="busy"
            :disabled="note.length > 200"
            data-testid="invite-submit"
          >
            Create invite link
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>

    <v-card data-testid="invite-list">
      <v-card-item>
        <v-card-title>Invites</v-card-title>
        <template #append>
          <v-switch
            v-model="showAll"
            label="Show all"
            density="compact"
            hide-details
            color="primary"
          />
        </template>
      </v-card-item>
      <v-progress-linear v-if="loading" indeterminate />
      <v-list v-if="visible.length" lines="two">
        <v-list-item v-for="invite in visible" :key="invite.id" data-testid="invite-item">
          <v-list-item-title>
            {{ roleLabel(invite.role) }}
            <span v-if="invite.note" class="text-medium-emphasis">– {{ invite.note }}</span>
          </v-list-item-title>
          <v-list-item-subtitle>
            <template v-if="invite.status === 'used'">
              used {{ formatTime(invite.usedAt) }}
              <template v-if="invite.usedBy"> by {{ invite.usedBy.username }}</template>
            </template>
            <template v-else>valid until {{ formatTime(invite.expiresAt) }}</template>
            <template v-if="invite.createdBy"> · by {{ invite.createdBy.username }}</template>
          </v-list-item-subtitle>
          <template #append>
            <LinkStatusChip :status="invite.status" class="mr-2" />
            <v-btn
              v-if="invite.status === 'pending'"
              variant="text"
              size="small"
              color="error"
              data-testid="invite-revoke"
              @click="revoke(invite)"
            >
              Revoke
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <v-card-text v-else-if="!loading" class="text-medium-emphasis">
        No pending invites.
      </v-card-text>
    </v-card>

    <LinkResultDialog :link="created" title="Invite link" @close="created = null" />
  </div>
</template>
