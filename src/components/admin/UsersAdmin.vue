<script setup lang="ts">
import {
  mdiAccountCancel,
  mdiAccountCheck,
  mdiDelete,
  mdiDotsVertical,
  mdiKeyChange,
  mdiLogout,
} from '@mdi/js'
import { computed, onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import { ROLES } from '@/api/authTypes'
import type { AdminUser, CreatedLink, LinkInfo, Role } from '@/api'
import LinkResultDialog from '@/components/admin/LinkResultDialog.vue'
import LinkStatusChip from '@/components/admin/LinkStatusChip.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { formatTime, roleLabel } from '@/services/accountRules'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

const api = useAuthApi()
const auth = useAuthStore()
const reauth = useReauthStore()
const notify = useNotifyStore()

const users = ref<AdminUser[]>([])
const resetLinks = ref<LinkInfo[]>([])
const loading = ref(true)
const showDeleted = ref(false)
const busyId = ref('')

const resetFor = ref<AdminUser | null>(null)
const resetMinutes = ref(60)
const resetSecondFactors = ref(false)
const createdReset = ref<CreatedLink | null>(null)
const confirm = ref<{ title: string; text: string; action: () => Promise<unknown> } | null>(null)

const roleItems = ROLES.map((value) => ({ value, title: roleLabel(value) }))
const expiryItems = [
  { value: 15, title: '15 minutes' },
  { value: 60, title: '1 hour' },
  { value: 240, title: '4 hours' },
  { value: 1440, title: '24 hours' },
]

const visible = computed(() =>
  users.value.filter((u) => showDeleted.value || u.status !== 'deleted'),
)
const pendingResets = computed(() => resetLinks.value.filter((l) => l.status === 'pending'))

function userName(id: string | null | undefined): string {
  const found = users.value.find((u) => u.id === id)
  return found ? found.displayName || found.username : (id ?? '–')
}

async function load(): Promise<void> {
  try {
    const [list, resets] = await Promise.all([api.users(), api.resetLinks()])
    users.value = list
    resetLinks.value = resets
  } catch (e) {
    notify.error(e, 'Could not load the users')
  } finally {
    loading.value = false
  }
}

async function act(user: AdminUser, action: () => Promise<unknown>, done: string): Promise<void> {
  busyId.value = user.id
  try {
    await reauth.run(action)
    notify.success(done)
    await load()
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busyId.value = ''
  }
}

function changeRole(user: AdminUser, role: Role): void {
  if (role === user.role) return
  void act(
    user,
    () => api.updateUser(user.id, { role }),
    `${user.displayName} is now ${roleLabel(role)}`,
  )
}

function toggleDisabled(user: AdminUser): void {
  const disable = user.status === 'active'
  if (!disable) {
    void act(user, () => api.updateUser(user.id, { status: 'active' }), 'Account enabled')
    return
  }
  confirm.value = {
    title: `Disable ${user.displayName}?`,
    text: 'The account is signed out everywhere and cannot sign in until you enable it again.',
    action: () =>
      act(user, () => api.updateUser(user.id, { status: 'disabled' }), 'Account disabled'),
  }
}

function askDelete(user: AdminUser): void {
  confirm.value = {
    title: `Delete ${user.displayName}?`,
    text: 'The account is deleted for good. Its name and colour stay visible in the version history and in “Who wrote what?”; the username stays reserved.',
    action: () => act(user, () => api.deleteUser(user.id), 'Account deleted'),
  }
}

function askRevokeSessions(user: AdminUser): void {
  confirm.value = {
    title: `Sign ${user.displayName} out everywhere?`,
    text: 'All devices of this account are signed out.',
    action: () => act(user, () => api.revokeUserSessions(user.id), 'Signed out'),
  }
}

/**
 * Runs a menu action after the click that closed the menu. A dialog opened during that click
 * can take it for a click outside and close again right away.
 */
function afterMenu(action: () => void): void {
  setTimeout(action, 0)
}

function startReset(user: AdminUser): void {
  resetFor.value = user
  resetMinutes.value = 60
  resetSecondFactors.value = false
}

async function createReset(): Promise<void> {
  const user = resetFor.value
  if (!user) return
  busyId.value = user.id
  try {
    createdReset.value = await reauth.run(() =>
      api.createResetLink(user.id, {
        expiresInMinutes: resetMinutes.value,
        resetSecondFactors: resetSecondFactors.value,
      }),
    )
    resetFor.value = null
    await load()
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busyId.value = ''
  }
}

async function revokeReset(link: LinkInfo): Promise<void> {
  try {
    await api.revokeResetLink(link.id)
    await load()
  } catch (e) {
    notify.error(e)
  }
}

onMounted(load)
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-card data-testid="users-admin">
      <v-card-item>
        <v-card-title>Users</v-card-title>
        <template #append>
          <v-switch
            v-model="showDeleted"
            label="Show deleted"
            density="compact"
            hide-details
            color="primary"
          />
        </template>
      </v-card-item>
      <v-progress-linear v-if="loading" indeterminate />
      <v-list lines="three">
        <v-list-item
          v-for="user in visible"
          :key="user.id"
          :data-testid="`user-${user.username}`"
          :class="{ 'text-disabled': user.status === 'deleted' }"
        >
          <template #prepend>
            <v-avatar :color="user.color" size="36" class="mr-1">
              <span class="text-white">{{ (user.displayName || user.username).charAt(0) }}</span>
            </v-avatar>
          </template>
          <v-list-item-title>
            {{ user.displayName }}
            <span class="text-medium-emphasis">({{ user.username }})</span>
            <v-chip v-if="user.status === 'disabled'" size="x-small" color="error" class="ml-1">
              disabled
            </v-chip>
            <v-chip v-if="user.status === 'deleted'" size="x-small" class="ml-1">deleted</v-chip>
            <v-chip v-if="user.id === auth.user?.id" size="x-small" color="primary" class="ml-1">
              you
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>
            Last sign-in {{ formatTime(user.lastLoginAt) }} · {{ user.sessionCount }}
            {{ user.sessionCount === 1 ? 'device' : 'devices' }}
            <br />
            {{ user.hasPassword ? 'password' : 'no password' }}
            <template v-if="user.totpEnabled"> · authenticator app</template>
            <template v-if="user.passkeyCount"> · {{ user.passkeyCount }} Passkey(s)</template>
          </v-list-item-subtitle>
          <template v-if="user.status !== 'deleted'" #append>
            <div class="d-flex align-center ga-1">
              <v-select
                :model-value="user.role"
                :items="roleItems"
                label="Role"
                density="compact"
                variant="outlined"
                hide-details
                class="role-select"
                :disabled="busyId === user.id"
                :aria-label="`Role of ${user.username}`"
                data-testid="user-role"
                @update:model-value="(role: Role) => changeRole(user, role)"
              />
              <v-menu>
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    :icon="mdiDotsVertical"
                    variant="text"
                    :aria-label="`Actions for ${user.username}`"
                    data-testid="user-actions"
                  />
                </template>
                <v-list density="compact">
                  <v-list-item
                    :prepend-icon="mdiKeyChange"
                    title="Reset link"
                    :disabled="user.status !== 'active'"
                    data-testid="user-reset"
                    @click="afterMenu(() => startReset(user))"
                  />
                  <v-list-item
                    :prepend-icon="mdiLogout"
                    title="Sign out everywhere"
                    @click="afterMenu(() => askRevokeSessions(user))"
                  />
                  <v-list-item
                    :prepend-icon="user.status === 'active' ? mdiAccountCancel : mdiAccountCheck"
                    :title="user.status === 'active' ? 'Disable' : 'Enable'"
                    data-testid="user-toggle-disabled"
                    @click="afterMenu(() => toggleDisabled(user))"
                  />
                  <v-list-item
                    :prepend-icon="mdiDelete"
                    title="Delete"
                    base-color="error"
                    data-testid="user-delete"
                    @click="afterMenu(() => askDelete(user))"
                  />
                </v-list>
              </v-menu>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card v-if="pendingResets.length" title="Pending reset links">
      <v-list>
        <v-list-item
          v-for="link in pendingResets"
          :key="link.id"
          :title="userName(link.accountId)"
          :subtitle="`valid until ${formatTime(link.expiresAt)}${link.resetSecondFactors ? ' · removes 2FA' : ''}`"
        >
          <template #append>
            <LinkStatusChip :status="link.status" class="mr-2" />
            <v-btn variant="text" size="small" color="error" @click="revokeReset(link)">
              Revoke
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-dialog
      :model-value="resetFor !== null"
      max-width="460"
      @update:model-value="resetFor = null"
    >
      <v-card v-if="resetFor" :title="`Reset ${resetFor.displayName}`">
        <v-form @submit.prevent="createReset">
          <v-card-text>
            <p class="mb-4">
              With the link, {{ resetFor.displayName }} sets a new password or a passkey. All
              devices of the account are signed out afterwards.
            </p>
            <v-select v-model="resetMinutes" :items="expiryItems" label="Valid for" />
            <v-checkbox
              v-model="resetSecondFactors"
              label="Also remove the authenticator app, recovery codes and passkeys (lost phone)"
              hide-details
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="resetFor = null">Cancel</v-btn>
            <v-btn
              type="submit"
              color="primary"
              variant="flat"
              :loading="busyId === resetFor.id"
              data-testid="reset-create"
            >
              Create link
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>

    <LinkResultDialog :link="createdReset" title="Reset link" @close="createdReset = null" />
    <ConfirmDialog
      :model-value="confirm !== null"
      :title="confirm?.title ?? ''"
      :text="confirm?.text ?? ''"
      confirm-text="Yes"
      danger
      @update:model-value="(open: boolean) => !open && (confirm = null)"
      @confirm="confirm && void confirm.action()"
    />
  </div>
</template>

<style scoped>
.role-select {
  width: 150px;
}
</style>
