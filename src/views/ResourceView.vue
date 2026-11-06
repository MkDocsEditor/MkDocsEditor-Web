<script setup lang="ts">
import {
  mdiContentCopy,
  mdiDelete,
  mdiDownload,
  mdiFolderMoveOutline,
  mdiOpenInNew,
  mdiPencil,
} from '@mdi/js'
import { computed, ref, watch } from 'vue'

import PageHeader from '@/components/common/PageHeader.vue'
import BacklinksList from '@/components/references/BacklinksList.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import { useApi } from '@/api'
import { copyText, downloadUrl } from '@/services/clipboard'
import { KIND_LABELS, colorFor, formatSize, iconFor, resourceKind } from '@/services/icons'
import { openFile } from '@/composables/useOpenFile'
import { resourceObjectUrl } from '@/services/resourceUrls'
import { useMovedRedirect } from '@/composables/useMovedRedirect'
import { formatDate } from '@/services/time'
import { useItemActionsStore } from '@/stores/itemActions'
import { useMoveStore } from '@/stores/move'
import { useNotifyStore } from '@/stores/notify'
import { useTransfersStore } from '@/stores/transfers'
import { useTreeStore } from '@/stores/tree'

const props = defineProps<{ id: string }>()

const tree = useTreeStore()
const notify = useNotifyStore()
const moveStore = useMoveStore()
const actions = useItemActionsStore()
const transfers = useTransfersStore()

const resource = computed(() => {
  const item = tree.get(props.id)
  return item?.type === 'resource' ? item : undefined
})
const lookingUp = useMovedRedirect(
  () => props.id,
  'resource',
  () => !!tree.root && !tree.loading && resource.value === undefined,
)
const ancestors = computed(() => tree.ancestors(props.id))
const kind = computed(() => (resource.value ? resourceKind(resource.value) : 'other'))
const path = computed(() => tree.path(props.id))
const modified = computed(() => {
  const time = resource.value?.modtime
  return time && !Number.isNaN(new Date(time).getTime()) ? formatDate(time) : ''
})

/** Images, PDFs, video and audio are shown inline; text files as text. */
const previewUrl = ref<string | null>(null)
const previewText = ref<string | null>(null)
const previewFailed = ref(false)
const MAX_TEXT = 200_000

watch(
  () => [resource.value?.id, resource.value?.modtime] as const,
  async ([id]) => {
    previewUrl.value = null
    previewText.value = null
    previewFailed.value = false
    if (!id || !resource.value) return
    try {
      if (kind.value === 'text') {
        const blob = await transfers.track(`Loading “${resource.value.name}”`, (t) =>
          useApi().getResourceContent(id, t.progress),
        )
        const text = await blob.slice(0, MAX_TEXT).text()
        if (resource.value?.id === id) previewText.value = text
      } else if (['image', 'pdf', 'video', 'audio'].includes(kind.value)) {
        const url = await transfers.track(`Loading “${resource.value.name}”`, (t) =>
          resourceObjectUrl(id, t.progress),
        )
        if (resource.value?.id === id) previewUrl.value = url
      }
    } catch {
      if (resource.value?.id === id) previewFailed.value = true
    }
  },
  { immediate: true },
)

async function open(): Promise<void> {
  try {
    await openFile(props.id, resource.value?.name ?? 'file')
  } catch (error) {
    notify.error(error, 'Could not open the file', () => void open())
  }
}

async function download(): Promise<void> {
  const item = resource.value
  if (!item) return
  try {
    const url = await transfers.track(`Downloading “${item.name}”`, (t) =>
      resourceObjectUrl(item.id, t.progress),
    )
    downloadUrl(item.name, url)
  } catch (error) {
    notify.error(error, 'Download failed', () => void download())
  }
}

async function copyPath(): Promise<void> {
  if (await copyText(path.value)) notify.success('Path copied')
}
</script>

<template>
  <v-container class="resource-view pb-16">
    <template v-if="resource">
      <ItemBreadcrumbs :ancestors="ancestors" />
      <PageHeader :title="resource.name" testid="resource-title">
        <template #icon
          ><v-icon :icon="iconFor(resource)" :color="colorFor(resource)" size="32"
        /></template>
      </PageHeader>

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          :prepend-icon="mdiOpenInNew"
          variant="outlined"
          data-testid="resource-open"
          @click="open"
        >
          Open
        </v-btn>
        <v-btn :prepend-icon="mdiDownload" variant="outlined" @click="download">Download</v-btn>
        <v-btn :prepend-icon="mdiContentCopy" @click="copyPath">Copy path</v-btn>
        <v-btn
          :prepend-icon="mdiPencil"
          data-testid="resource-rename"
          @click="moveStore.rename(resource)"
        >
          Rename
        </v-btn>
        <v-btn
          :prepend-icon="mdiFolderMoveOutline"
          data-testid="resource-move"
          @click="moveStore.open(resource)"
        >
          Move
        </v-btn>
        <v-btn
          :prepend-icon="mdiDelete"
          color="error"
          data-testid="resource-delete"
          @click="actions.remove(resource)"
        >
          Delete
        </v-btn>
      </div>

      <v-card variant="outlined" class="mb-4">
        <v-list lines="one">
          <v-list-item title="Kind" :subtitle="KIND_LABELS[kind]" />
          <v-list-item title="Size" :subtitle="formatSize(resource.filesize)" />
          <v-list-item v-if="modified" title="Modified" :subtitle="modified" />
          <v-list-item title="Path" :subtitle="path" data-testid="resource-path" />
        </v-list>
      </v-card>

      <v-card variant="outlined" class="mb-4">
        <v-card-subtitle class="pt-4">Used by</v-card-subtitle>
        <BacklinksList :id="resource.id" type="resource" :reload-key="tree.root" />
      </v-card>

      <div class="resource-view__preview" data-testid="resource-preview">
        <img v-if="previewUrl && kind === 'image'" :src="previewUrl" :alt="resource.name" />
        <object
          v-else-if="previewUrl && kind === 'pdf'"
          :data="previewUrl"
          type="application/pdf"
          class="resource-view__pdf"
        >
          <p class="pa-4">This browser cannot show PDFs inline. Use “Open”.</p>
        </object>
        <video v-else-if="previewUrl && kind === 'video'" :src="previewUrl" controls />
        <audio v-else-if="previewUrl && kind === 'audio'" :src="previewUrl" controls />
        <pre v-else-if="previewText !== null" class="resource-view__text">{{ previewText }}</pre>
        <v-alert v-else-if="previewFailed" type="warning">
          The preview could not be loaded.
        </v-alert>
      </div>
    </template>

    <v-empty-state
      v-else-if="!tree.loading && tree.root && !lookingUp"
      title="Not found"
      text="This file does not exist (any more)."
    >
      <template #actions>
        <v-btn color="primary" variant="flat" :to="{ name: 'home' }">To the start page</v-btn>
      </template>
    </v-empty-state>
  </v-container>
</template>

<style scoped>
.resource-view__preview img,
.resource-view__preview video {
  max-width: 100%;
  max-height: 70vh;
  border-radius: var(--md-sys-shape-corner-small);
  display: block;
}
.resource-view__preview audio {
  width: 100%;
}
.resource-view__pdf {
  width: 100%;
  height: 75vh;
  border-radius: var(--md-sys-shape-corner-small);
}
.resource-view__text {
  font-family: var(--app-font-mono);
  font-size: var(--md-sys-typescale-body-medium-size);
  white-space: pre-wrap;
  word-break: break-word;
  padding: var(--app-space-2) var(--app-space-4);
  border-radius: var(--md-sys-shape-corner-small);
  background: rgb(var(--v-theme-code-code-background));
  color: rgb(var(--v-theme-code-text));
  max-height: 70vh;
  overflow: auto;
}
</style>
