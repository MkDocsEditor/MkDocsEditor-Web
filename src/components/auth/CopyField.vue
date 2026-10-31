<script setup lang="ts">
import { mdiCheck, mdiContentCopy } from '@mdi/js'
import { ref } from 'vue'

import { copyText } from '@/services/clipboard'

const props = defineProps<{ value: string; label: string; testid?: string }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  copied.value = await copyText(props.value)
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 2000)
}
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
        @click="copy"
      />
    </template>
  </v-text-field>
</template>
