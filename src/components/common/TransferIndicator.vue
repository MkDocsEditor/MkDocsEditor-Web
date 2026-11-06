<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { TAKES_LONG_MS } from '@/composables/useTakesLong'
import { formatSize } from '@/services/icons'
import { useTransfersStore } from '@/stores/transfers'
import type { Transfer } from '@/stores/transfers'

/** Short actions come and go without a flash. */
const SHOW_AFTER_MS = 700
/** Everything sent and no answer yet for this long: the server is at work on it. */
const SENT_SLOW_AFTER_MS = 1500

const transfers = useTransfersStore()
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 500)
onBeforeUnmount(() => clearInterval(ticker))

const shown = computed(() =>
  transfers.active.filter((t) => now.value - t.startedAt >= SHOW_AFTER_MS),
)

function percent(t: Transfer): number | null {
  return t.loaded !== null && t.total ? Math.min(100, (t.loaded / t.total) * 100) : null
}

function bytes(t: Transfer): string {
  if (t.loaded === null) return ''
  return t.total ? `${formatSize(t.loaded)} of ${formatSize(t.total)}` : formatSize(t.loaded)
}

/** No progress for a while, or everything sent and no answer: busy, which is not an error. */
function slow(t: Transfer): boolean {
  const quiet = now.value - t.lastProgressAt
  const sent = t.loaded !== null && t.total !== null && t.loaded >= t.total
  return quiet >= TAKES_LONG_MS || (sent && quiet >= SENT_SLOW_AFTER_MS)
}
</script>

<template>
  <div v-if="shown.length > 0" class="transfer-indicator" aria-live="polite">
    <v-card v-for="t in shown" :key="t.id" class="mb-2" elevation="3" data-testid="transfer">
      <v-card-text class="py-4">
        <div class="d-flex ga-2 text-body-medium">
          <span class="text-truncate flex-grow-1">{{ t.label }}</span>
          <span class="text-medium-emphasis text-no-wrap" data-testid="transfer-bytes">
            {{ bytes(t) }}
          </span>
        </div>
        <v-progress-linear
          :model-value="percent(t) ?? undefined"
          :indeterminate="percent(t) === null || slow(t)"
          color="primary"
          class="mt-2"
          rounded
        />
        <div
          v-if="slow(t)"
          class="text-body-small text-medium-emphasis mt-1"
          data-testid="transfer-slow"
        >
          The server is still working on it. This takes longer than usual.
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.transfer-indicator {
  position: fixed;
  inset-inline-start: var(--app-space-4);
  inset-block-end: var(--app-space-4);
  width: min(360px, calc(100vw - 2 * var(--app-space-4)));
  z-index: 2400;
}
</style>
