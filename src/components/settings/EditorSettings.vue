<script setup lang="ts">
import { authorHighlight, lineNumbers } from '@/composables/preferences'
import type { AuthorHighlightMode } from '@/editor/authorship'

const authorModes: { value: AuthorHighlightMode; title: string }[] = [
  { value: 'marker', title: 'Strip and marker' },
  { value: 'strip', title: 'Strip next to the line' },
  { value: 'off', title: 'Off' },
]
</script>

<template>
  <v-card title="Documents" data-testid="settings-editor">
    <v-card-text class="d-flex flex-column ga-4">
      <v-switch
        v-model="lineNumbers"
        color="primary"
        label="Show line numbers"
        messages="On wide screens; phones have no room for them."
        data-testid="setting-line-numbers"
      />
      <v-select
        v-model="authorHighlight"
        :items="authorModes"
        label="Show who wrote what"
        hint="Text by others gets a strip in their color, and a marker where it was changed."
        persistent-hint
        data-testid="setting-author-highlight"
      />
    </v-card-text>
  </v-card>
</template>
