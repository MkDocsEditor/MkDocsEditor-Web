<script setup lang="ts">
import { computed } from 'vue'

import { useNotifyStore } from '@/stores/notify'

const notify = useNotifyStore()
const current = computed(() => notify.queue[0])

function retry(): void {
  const notification = current.value
  if (!notification) return
  notify.dismiss(notification.id)
  notification.retry?.()
}
</script>

<template>
  <v-snackbar
    :model-value="current !== undefined"
    :color="current?.color"
    :timeout="current?.color === 'error' ? 8000 : 3000"
    location="bottom"
    @update:model-value="(open: boolean) => !open && current && notify.dismiss(current.id)"
  >
    {{ current?.text }}
    <template #actions>
      <v-btn v-if="current?.retry" variant="text" data-testid="notification-retry" @click="retry">
        Retry
      </v-btn>
      <v-btn variant="text" @click="current && notify.dismiss(current.id)">OK</v-btn>
    </template>
  </v-snackbar>
</template>
