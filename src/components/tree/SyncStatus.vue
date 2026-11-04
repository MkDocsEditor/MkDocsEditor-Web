<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { syncStatusText } from '@/services/time'
import { useLiveStore } from '@/stores/live'
import { useTreeStore } from '@/stores/tree'

const tree = useTreeStore()
const live = useLiveStore()

const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 60_000)
onBeforeUnmount(() => clearInterval(ticker))

const text = computed(() =>
  syncStatusText(tree.lastSync, !!tree.error || live.connectionLost, now.value),
)
</script>

<template>
  <div v-if="text" class="text-caption text-medium-emphasis" data-testid="sync-status">
    {{ text }}
  </div>
</template>
