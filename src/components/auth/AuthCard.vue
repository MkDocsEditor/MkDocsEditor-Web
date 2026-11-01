<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; maxWidth?: number }>()
</script>

<template>
  <v-container class="fill-height justify-center">
    <v-card width="100%" :max-width="maxWidth ?? 440" elevation="4" class="pa-2">
      <v-card-item class="text-center">
        <img src="/logo.png" width="72" height="72" class="d-block mx-auto mb-2" alt="" />
        <h1 class="text-h5">{{ title }}</h1>
        <v-card-subtitle v-if="subtitle">{{ subtitle }}</v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <slot />
      </v-card-text>
    </v-card>
  </v-container>
</template>
