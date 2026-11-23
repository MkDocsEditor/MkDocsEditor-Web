<script setup lang="ts">
import { mdiContentCopy } from '@mdi/js'

import { useApi } from '@/api'
import type { ResourceModel } from '@/api'
import { copySvg } from '@/services/clipboard'
import { useNotifyStore } from '@/stores/notify'

/** Copies an SVG image as SVG; shown over the image while the pointer is on it. */
const props = defineProps<{ resource: Pick<ResourceModel, 'id' | 'name'> }>()
const notify = useNotifyStore()

async function copy(): Promise<void> {
  const text = useApi()
    .getResourceContent(props.resource.id)
    .then((blob) => blob.text())
  if (await copySvg(text)) {
    notify.success('SVG copied')
    return
  }
  // the download failed, or the browser refused the clipboard
  const reason = await text.then(
    () => 'the browser did not allow it',
    (error: unknown) => error,
  )
  notify.error(reason, 'Could not copy the SVG', () => void copy())
}
</script>

<template>
  <v-btn
    :icon="mdiContentCopy"
    size="small"
    color="surface"
    variant="elevated"
    title="Copy SVG"
    aria-label="Copy SVG"
    data-testid="copy-svg"
    @click.stop="copy"
  />
</template>
