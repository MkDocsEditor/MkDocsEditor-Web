<script setup lang="ts">
import { computed } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useLiveStore } from '@/stores/live'
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '@/services/settingsSections'
import type { SettingsGroup } from '@/services/settingsSections'

/** The sections of the settings page, by group: a side column, or the whole page on phones. */
defineProps<{ active?: string }>()

const auth = useAuthStore()
const live = useLiveStore()

const groups = computed(() =>
  SETTINGS_GROUPS.filter((g) => g.id !== 'admin' || auth.isAdmin).map((group) => ({
    ...group,
    sections: SETTINGS_SECTIONS.filter((s) => s.group === (group.id as SettingsGroup)),
  })),
)

/** Until the second factor is set up, only that is reachable. */
function locked(id: string): boolean {
  return auth.secondFactorSetupRequired && id !== 'security'
}
</script>

<template>
  <v-list nav aria-label="Settings sections" data-testid="settings-nav">
    <template v-for="group in groups" :key="group.id">
      <v-list-subheader v-if="group.title">{{ group.title }}</v-list-subheader>
      <v-divider v-else class="my-2" />
      <v-list-item
        v-for="section in group.sections"
        :key="section.id"
        :to="{ name: 'settings', params: { section: section.id } }"
        :active="active === section.id"
        :prepend-icon="section.icon"
        :title="section.title"
        :disabled="locked(section.id)"
        :data-testid="`settings-nav-${section.id}`"
      >
        <template v-if="section.id === 'requests' && live.pendingAccessRequests > 0" #append>
          <v-badge inline color="error" :content="live.pendingAccessRequests" />
        </template>
      </v-list-item>
    </template>
  </v-list>
</template>
