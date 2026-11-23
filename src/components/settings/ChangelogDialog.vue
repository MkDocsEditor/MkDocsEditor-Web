<script setup lang="ts">
import { mdiClose } from '@mdi/js'

import AppDialog from '@/components/common/AppDialog.vue'

/** "What's new": the pull requests merged before this build, like on Android. */
defineProps<{
  /** The version line of the About screen, e.g. "dev (699a5bc)". */
  version: string
  changes: readonly { number: number; title: string; date: string }[]
}>()
const open = defineModel<boolean>({ required: true })

const PULL_URL = 'https://github.com/MkDocsEditor/MkDocsEditor-Web/pull/'
</script>

<template>
  <AppDialog v-model="open" size="medium" scrollable>
    <v-card data-testid="changelog-dialog">
      <v-toolbar density="comfortable" color="surface">
        <v-toolbar-title>What's new</v-toolbar-title>
        <v-btn :icon="mdiClose" aria-label="Close" @click="open = false" />
      </v-toolbar>
      <v-card-subtitle class="pb-2" data-testid="changelog-version">
        Version {{ version }}
      </v-card-subtitle>
      <v-divider />
      <v-card-text class="pa-0">
        <v-list v-if="changes.length > 0" lines="two" bg-color="transparent">
          <v-list-item
            v-for="change in changes"
            :key="change.number"
            :title="change.title"
            :subtitle="`#${change.number} · ${change.date}`"
            :href="PULL_URL + change.number"
            target="_blank"
            rel="noopener"
            data-testid="changelog-change"
          />
        </v-list>
        <p v-else class="pa-4 text-medium-emphasis">No changes are known for this build.</p>
      </v-card-text>
    </v-card>
  </AppDialog>
</template>
