<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useAuthApi } from '@/api'
import { ROLES } from '@/api/authTypes'
import type { AccessRequest, CreatedLink, Role } from '@/api'
import LinkResultDialog from '@/components/admin/LinkResultDialog.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadError from '@/components/common/LoadError.vue'
import { useLoad } from '@/composables/useLoad'
import { roleLabel } from '@/services/accountRules'
import { formatTime } from '@/services/time'
import { useLiveStore } from '@/stores/live'
import { useNotifyStore } from '@/stores/notify'

const api = useAuthApi()
const live = useLiveStore()
const notify = useNotifyStore()

const requests = ref<AccessRequest[]>([])

const { loading, loadError, load } = useLoad({
  failure: 'Could not load the access requests',
  hasData: () => requests.value.length > 0,
  fetch: async () => {
    requests.value = await api.accessRequests('pending')
  },
})

const approving = ref<AccessRequest | null>(null)
const rejecting = ref<AccessRequest | null>(null)
const rejectOpen = computed({
  get: () => rejecting.value !== null,
  set: (open) => {
    if (!open) rejecting.value = null
  },
})
const role = ref<Role>('editor')
const hours = ref(168)
const busy = ref(false)
const created = ref<CreatedLink | null>(null)

const roleItems = ROLES.map((value) => ({ value, title: roleLabel(value) }))
const expiryItems = [
  { value: 24, title: '1 day' },
  { value: 72, title: '3 days' },
  { value: 168, title: '7 days' },
  { value: 720, title: '30 days' },
]

function startApproving(request: AccessRequest): void {
  role.value = 'editor'
  hours.value = 168
  approving.value = request
}

async function approve(): Promise<void> {
  if (!approving.value) return
  busy.value = true
  try {
    created.value = await api.approveAccessRequest(approving.value.id, {
      role: role.value,
      expiresInHours: hours.value,
    })
    approving.value = null
    await load()
  } catch (e) {
    notify.error(e, 'Could not approve the request')
    approving.value = null
    await load()
  } finally {
    busy.value = false
  }
}

async function reject(): Promise<void> {
  if (!rejecting.value) return
  try {
    await api.rejectAccessRequest(rejecting.value.id)
    notify.success('Request rejected')
  } catch (e) {
    notify.error(e, 'Could not reject the request')
  }
  await load()
}

onMounted(load)
// a new request, or another admin decided one
watch(() => live.pendingAccessRequests, load)
</script>

<template>
  <v-card data-testid="access-requests">
    <v-card-item>
      <v-card-title>Access requests</v-card-title>
      <v-card-subtitle>People without an account who ask for an invite</v-card-subtitle>
    </v-card-item>
    <v-progress-linear v-if="loading" indeterminate />
    <v-card-text v-if="loadError">
      <LoadError title="Could not load the access requests" :error="loadError" @retry="load" />
    </v-card-text>
    <template v-if="requests.length">
      <v-card-text class="py-0">
        <v-alert type="warning" class="mb-2">
          Anyone can type any name. Confirm who it is, for example by asking them directly, before
          you approve.
        </v-alert>
      </v-card-text>
      <v-list lines="three">
        <v-list-item
          v-for="request in requests"
          :key="request.id"
          data-testid="access-request-item"
        >
          <!-- name and message are untrusted: plain text, never markdown, HTML or a link -->
          <v-list-item-title data-testid="access-request-name">{{
            request.name
          }}</v-list-item-title>
          <p v-if="request.message" class="text-body-medium" data-testid="access-request-message">
            {{ request.message }}
          </p>
          <v-list-item-subtitle>
            <template v-if="request.invitedByName">Link from {{ request.invitedByName }}</template>
            <template v-else>Link from an unknown account</template>
            <template v-if="request.documentPath"> · {{ request.documentPath }}</template>
            · asked {{ formatTime(request.createdAt) }}
          </v-list-item-subtitle>
          <template #append>
            <div class="d-flex ga-2">
              <v-btn size="small" color="error" @click="rejecting = request">Reject</v-btn>
              <v-btn
                size="small"
                color="primary"
                variant="flat"
                data-testid="access-request-approve"
                @click="startApproving(request)"
              >
                Approve
              </v-btn>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </template>
    <v-card-text v-else-if="!loading && !loadError" class="text-medium-emphasis">
      No requests are waiting.
    </v-card-text>

    <AppDialog :model-value="approving !== null" @update:model-value="approving = null">
      <v-card v-if="approving" title="Approve the request">
        <v-form @submit.prevent="approve">
          <v-card-text>
            <p class="mb-4">
              This creates an invite for “{{ approving.name }}”. The name is only claimed, so
              confirm the person first. Their open page continues by itself.
            </p>
            <v-select
              v-model="role"
              :items="roleItems"
              label="Role"
              data-testid="access-request-role"
            />
            <v-select v-model="hours" :items="expiryItems" label="Invite valid for" />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn @click="approving = null">Cancel</v-btn>
            <v-btn
              type="submit"
              color="primary"
              variant="flat"
              :loading="busy"
              data-testid="access-request-confirm"
            >
              Approve
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </AppDialog>

    <ConfirmDialog
      v-model="rejectOpen"
      title="Reject the request?"
      :text="`${rejecting?.name ?? ''} will see that the request was rejected.`"
      confirm-text="Reject"
      danger
      @confirm="reject"
    />
    <LinkResultDialog :link="created" title="Invite link" @close="created = null" />
  </v-card>
</template>
