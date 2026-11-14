<script setup lang="ts">
import { mdiCheck, mdiContentCopy } from '@mdi/js'

import { useCopied } from '@/composables/useCopied'
import { useNotifyStore } from '@/stores/notify'

/** A command or config to paste somewhere else, with a copy button. */
const props = defineProps<{ code: string; label: string; testid?: string }>()

const { copied, copy } = useCopied()
const notify = useNotifyStore()

async function copyCode(): Promise<void> {
  if (!(await copy(props.code))) {
    notify.error('The browser did not allow copying. Select the text instead.')
  }
}
</script>

<template>
  <div class="code-snippet" :data-testid="testid">
    <pre class="code-snippet__code" :aria-label="label">{{ code }}</pre>
    <v-btn
      class="code-snippet__copy"
      :icon="copied ? mdiCheck : mdiContentCopy"
      :aria-label="copied ? 'Copied' : `Copy ${label.toLowerCase()}`"
      size="small"
      variant="text"
      @click="copyCode"
    />
  </div>
</template>

<style scoped>
.code-snippet {
  position: relative;
  border-radius: var(--md-sys-shape-corner-small);
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.code-snippet__code {
  margin: 0;
  padding: var(--app-space-2) var(--app-space-4);
  padding-right: calc(var(--app-space-8) + var(--app-space-4));
  font-family: var(--app-font-mono);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-snippet__copy {
  position: absolute;
  top: var(--app-space-1);
  right: var(--app-space-1);
}
</style>
