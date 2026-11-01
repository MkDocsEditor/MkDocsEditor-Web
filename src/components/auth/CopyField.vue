<script setup lang="ts">
import { mdiCheck, mdiContentCopy } from '@mdi/js'

import { useCopied } from '@/services/copied'

defineProps<{ value: string; label: string; testid?: string }>()

const { copied, copy } = useCopied()
</script>

<template>
  <v-text-field
    :model-value="value"
    :label="label"
    readonly
    variant="outlined"
    density="comfortable"
    hide-details
    :data-testid="testid"
    @focus="($event.target as HTMLInputElement).select()"
  >
    <template #append-inner>
      <v-btn
        :icon="copied ? mdiCheck : mdiContentCopy"
        :aria-label="copied ? 'Copied' : `Copy ${label.toLowerCase()}`"
        variant="text"
        size="small"
        @click="copy(value)"
      />
    </template>
  </v-text-field>
</template>
