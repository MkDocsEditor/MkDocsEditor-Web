<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <v-container class="fill-height d-flex align-center justify-center" max-width="100%">
    <v-card width="100%" max-width="480" variant="elevated" color="surface" class="pa-2">
      <v-card-item class="text-center">
        <img src="/logo.png" width="72" height="72" class="d-block mx-auto mb-2" alt="" />
        <h1 class="text-headline-small">{{ title }}</h1>
        <v-card-subtitle v-if="subtitle">{{ subtitle }}</v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <slot />
      </v-card-text>
    </v-card>
  </v-container>
</template>
