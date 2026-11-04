<script setup lang="ts">
import { mdiRefresh } from '@mdi/js'

import { describeError } from '@/stores/notify'

defineProps<{ title: string; error: unknown }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <v-alert
    type="error"
    variant="tonal"
    role="alert"
    :title="title"
    :text="describeError(error)"
    data-testid="load-error"
  >
    <template #append>
      <v-btn
        :prepend-icon="mdiRefresh"
        variant="text"
        data-testid="load-error-retry"
        @click="$emit('retry')"
      >
        Retry
      </v-btn>
    </template>
  </v-alert>
</template>
