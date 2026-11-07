<script setup lang="ts">
import { showFilesInTree, startPage, themeChoice } from '@/composables/preferences'
</script>

<template>
  <v-card title="General" class="appearance-settings" data-testid="settings-appearance">
    <v-card-text class="d-flex flex-column ga-4">
      <v-radio-group v-model="themeChoice" label="Theme" hide-details data-testid="setting-theme">
        <v-radio value="system" label="Like the system" />
        <v-radio value="light" label="Light" />
        <v-radio value="dark" label="Dark" />
      </v-radio-group>
      <v-radio-group
        v-model="startPage"
        label="Start page"
        hide-details
        data-testid="setting-start-page"
      >
        <v-radio value="dashboard" label="What’s going on" />
        <v-radio value="files" label="Files of the top folder" />
      </v-radio-group>
      <v-switch
        v-model="showFilesInTree"
        color="primary"
        label="Show files in the navigation tree"
        messages="Pictures and other files next to the pages. Large wikis are easier to browse without."
        data-testid="setting-tree-files"
      />
    </v-card-text>
  </v-card>
</template>

<style scoped>
/* the labels of the choices line up with the switch below them */
.appearance-settings :deep(.v-radio-group > .v-input__control > .v-label) {
  margin-inline-start: 0;
}
</style>
