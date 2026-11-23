<script setup lang="ts">
import { mdiChevronRight } from '@mdi/js'
import build from 'virtual:changelog'
import { computed, onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import type { ServerInfo } from '@/api'
import ChangelogDialog from '@/components/settings/ChangelogDialog.vue'
import { getConfig } from '@/config'
import { OBTAINIUM_ADD_URL } from '@/services/connectLink'

/** Versions and addresses, for bug reports and for connecting other clients. */
const appVersion = import.meta.env.VITE_APP_VERSION ?? 'dev'
/** With the commit of the build, so that the changelog can be matched to it: "dev (699a5bc)". */
const versionLine = build.commit ? `${appVersion} (${build.commit})` : appVersion
const changelogOpen = ref(false)
const changes = build.changes
const appConfig = getConfig()
const server = ref<ServerInfo | null>(null)
const unreachable = ref(false)
const backendUrl = computed(() => server.value?.backendUrl ?? appConfig.backendUrl)
const wikiUrl = computed(() => server.value?.wikiUrl ?? appConfig.wikiUrl)

onMounted(async () => {
  try {
    server.value = await useAuthApi().serverInfo()
  } catch {
    unreachable.value = true
  }
})
</script>

<template>
  <div class="d-flex flex-column ga-4" data-testid="settings-about">
    <v-card title="MkDocsEditor for the web">
      <v-list lines="two" bg-color="transparent">
        <v-list-item
          title="Version"
          :subtitle="versionLine"
          :append-icon="mdiChevronRight"
          data-testid="about-version"
          @click="changelogOpen = true"
        />
        <v-list-item
          title="Source code"
          subtitle="github.com/MkDocsEditor/MkDocsEditor-Web"
          href="https://github.com/MkDocsEditor/MkDocsEditor-Web"
          target="_blank"
          rel="noopener"
        />
        <v-list-item
          title="Android app"
          subtitle="Install and update it with Obtainium"
          :href="OBTAINIUM_ADD_URL"
          target="_blank"
          rel="noopener"
        />
      </v-list>
    </v-card>
    <v-card title="Server">
      <v-list v-if="server" lines="two" bg-color="transparent">
        <v-list-item title="Name" :subtitle="server.name" />
        <v-list-item
          title="Version"
          :subtitle="`${server.version} (protocol ${server.protocolVersion})`"
          data-testid="about-server-version"
        />
        <v-list-item title="Address" :subtitle="backendUrl" />
        <v-list-item
          v-if="wikiUrl"
          title="Wiki"
          :subtitle="wikiUrl"
          :href="wikiUrl"
          target="_blank"
          rel="noopener"
        />
      </v-list>
      <v-card-text v-else-if="unreachable" class="text-medium-emphasis">
        The server cannot be reached right now.
      </v-card-text>
      <v-progress-linear v-else indeterminate />
    </v-card>
    <ChangelogDialog v-model="changelogOpen" :version="versionLine" :changes="changes" />
  </div>
</template>
