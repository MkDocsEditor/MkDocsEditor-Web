<script setup lang="ts">
import { getConfig } from '@/services/config'

const config = getConfig()
</script>

<template>
  <v-container class="py-8">
    <v-empty-state
      headline="MkDocsEditor"
      title="Willkommen"
      :text="`Backend: ${config.backendUrl}`"
      image="/logo.png"
    />
  </v-container>
</template>
