<script setup lang="ts">
import { mdiArrowLeft } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import { useAuthApi } from '@/api'
import type { AccountInfo } from '@/api'
import AppTokensCard from '@/components/account/AppTokensCard.vue'
import ConnectAgentCard from '@/components/account/ConnectAgentCard.vue'
import AvatarCard from '@/components/account/AvatarCard.vue'
import ConnectAppCard from '@/components/account/ConnectAppCard.vue'
import PasskeysCard from '@/components/account/PasskeysCard.vue'
import PasswordCard from '@/components/account/PasswordCard.vue'
import ProfileCard from '@/components/account/ProfileCard.vue'
import SessionsCard from '@/components/account/SessionsCard.vue'
import TotpCard from '@/components/account/TotpCard.vue'
import AccessRequestsAdmin from '@/components/admin/AccessRequestsAdmin.vue'
import AuditAdmin from '@/components/admin/AuditAdmin.vue'
import InvitesAdmin from '@/components/admin/InvitesAdmin.vue'
import SettingsAdmin from '@/components/admin/SettingsAdmin.vue'
import UsersAdmin from '@/components/admin/UsersAdmin.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AboutSettings from '@/components/settings/AboutSettings.vue'
import AccountNotices from '@/components/settings/AccountNotices.vue'
import AppearanceSettings from '@/components/settings/AppearanceSettings.vue'
import EditorSettings from '@/components/settings/EditorSettings.vue'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import { useAuthStore } from '@/stores/auth'
import { describeError } from '@/stores/notify'

import { isAccountSection, isAdminSection, sectionInfo } from '@/services/settingsSections'

/**
 * Everything to set up in one place, like the Android app: the account on this server, this
 * browser, the administration (admins only) and what this is. A column of sections on the
 * side; on phones the list first, then one section.
 */
const props = defineProps<{ section?: string }>()

const auth = useAuthStore()
const router = useRouter()
const { mdAndUp } = useDisplay()
/** One column below 960 px: the list of sections, then one section. */
const narrow = computed(() => !mdAndUp.value)

const info = computed(() => sectionInfo(props.section))
const shown = computed(() =>
  info.value && (!isAdminSection(info.value.id) || auth.isAdmin) ? info.value : undefined,
)

// Wide screens always show a section: the first one, or the only one that is reachable.
watch(
  [() => props.section, narrow],
  () => {
    if (narrow.value || shown.value) return
    const section = auth.secondFactorSetupRequired ? 'security' : 'profile'
    void router.replace({ name: 'settings', params: { section } })
  },
  { immediate: true },
)

const account = ref<AccountInfo | null>(null)
/** Reloads the device list after the app was connected. */
const sessionsVersion = ref(0)
/** Reloads the token list after an agent was connected. */
const tokensVersion = ref(0)
const error = ref('')

/** Reloads the account after a change; the shell's user (name, colour, picture) follows. */
async function load(): Promise<void> {
  try {
    account.value = await useAuthApi().account()
    error.value = ''
    auth.setUser(account.value)
  } catch (e) {
    error.value = describeError(e)
  }
}

watch(
  () => isAccountSection(shown.value?.id),
  (needed) => {
    if (needed && !account.value) void load()
  },
  { immediate: true },
)
</script>

<template>
  <v-container class="settings-view" :max-width="1200">
    <PageHeader v-if="!narrow || !shown" title="Settings" testid="settings-title" />
    <PageHeader v-else :title="shown.title" testid="settings-title">
      <template #icon>
        <v-btn
          :icon="mdiArrowLeft"
          aria-label="All settings"
          :to="{ name: 'settings' }"
          :active="false"
          data-testid="settings-back"
        />
      </template>
    </PageHeader>

    <div :class="{ 'settings-view__columns': !narrow }">
      <SettingsNav v-if="!narrow || !shown" :active="shown?.id" class="settings-view__nav" />

      <section
        v-if="shown"
        class="settings-view__content"
        :aria-label="shown.title"
        :data-testid="`settings-section-${shown.id}`"
      >
        <h2 v-if="!narrow" class="text-title-large mb-4">{{ shown.title }}</h2>

        <template v-if="shown.group === 'account'">
          <AccountNotices :account="account" @changed="load" />
          <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
        </template>

        <!-- the device list loads on its own and does not need the account details -->
        <div v-if="shown.id === 'sessions'" class="d-flex flex-column ga-4">
          <ConnectAppCard @connected="sessionsVersion++" />
          <SessionsCard :key="sessionsVersion" />
        </div>
        <div v-else-if="shown.id === 'agents'" class="d-flex flex-column ga-4">
          <ConnectAgentCard @created="tokensVersion++" />
          <AppTokensCard :key="tokensVersion" />
        </div>
        <template v-else-if="shown.group === 'account'">
          <div v-if="!account">
            <v-progress-linear v-if="!error" indeterminate aria-label="Loading" />
          </div>
          <div v-else-if="shown.id === 'profile'" class="d-flex flex-column ga-4">
            <ProfileCard :account="account" @changed="load" />
            <!-- servers with pictures always send the field, null without one -->
            <AvatarCard v-if="account.avatar !== undefined" :account="account" @changed="load" />
          </div>
          <div v-else class="d-flex flex-column ga-4">
            <PasswordCard :account="account" @changed="load" />
            <PasskeysCard :account="account" @changed="load" />
            <TotpCard :account="account" @changed="load" />
          </div>
        </template>

        <EditorSettings v-else-if="shown.id === 'editor'" />
        <AppearanceSettings v-else-if="shown.id === 'appearance'" />
        <UsersAdmin v-else-if="shown.id === 'users'" />
        <InvitesAdmin v-else-if="shown.id === 'invites'" />
        <AccessRequestsAdmin v-else-if="shown.id === 'requests'" />
        <AuditAdmin v-else-if="shown.id === 'audit'" />
        <SettingsAdmin v-else-if="shown.id === 'server'" />
        <AboutSettings v-else-if="shown.id === 'about'" />
      </section>
    </div>
  </v-container>
</template>

<style scoped>
.settings-view__columns {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: var(--app-space-6);
  align-items: start;
}

.settings-view__nav {
  position: sticky;
  top: calc(var(--v-layout-top, 64px) + var(--app-space-4));
  padding: 0;
}
</style>
