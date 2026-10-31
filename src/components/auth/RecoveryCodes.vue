<script setup lang="ts">
import { mdiContentCopy, mdiDownload } from '@mdi/js'

import { copyText, downloadText } from '@/services/clipboard'
import { useNotifyStore } from '@/stores/notify'

const props = defineProps<{ codes: string[]; username?: string }>()
const notify = useNotifyStore()

function asText(): string {
  return [
    `MkDocsEditor recovery codes${props.username ? ` for ${props.username}` : ''}`,
    'Each code works once.',
    '',
    ...props.codes,
    '',
  ].join('\n')
}

async function copy(): Promise<void> {
  if (await copyText(asText())) notify.success('Codes copied')
  else notify.push('Could not copy, please write them down.', 'warning')
}

function download(): void {
  downloadText('mkdocseditor-recovery-codes.txt', asText())
}
</script>

<template>
  <div>
    <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
      These codes are shown only now. Keep them safe: each code replaces the code from the app once.
    </v-alert>
    <ul class="codes" aria-label="Recovery codes" data-testid="recovery-codes">
      <li v-for="code in codes" :key="code">
        <code>{{ code }}</code>
      </li>
    </ul>
    <div class="d-flex flex-wrap ga-2 mt-3">
      <v-btn :prepend-icon="mdiContentCopy" variant="tonal" @click="copy">Copy</v-btn>
      <v-btn :prepend-icon="mdiDownload" variant="tonal" @click="download">Download</v-btn>
    </div>
  </div>
</template>

<style scoped>
.codes {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 4px 16px;
  font-size: 1.05rem;
}
</style>
