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
import { useRouter } from 'vue-router'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import BacklinksList from '@/components/references/BacklinksList.vue'
import { useBreakWarning } from '@/components/references/backlinks'
import NameDialog from '@/components/common/NameDialog.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import { useApi } from '@/api'
import { copyText, downloadUrl } from '@/services/clipboard'
import { KIND_LABELS, colorFor, formatSize, iconFor, resourceKind } from '@/services/icons'
import { openResource } from '@/services/resources'
import { resourceObjectUrl } from '@/services/resourceUrls'
import { useMovedRedirect } from '@/services/redirects'
import { formatDate } from '@/services/time'
import { useMoveStore } from '@/stores/move'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

const props = defineProps<{ id: string }>()

const tree = useTreeStore()
const notify = useNotifyStore()
const moveStore = useMoveStore()
const router = useRouter()

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
        const blob = await useApi().getResourceContent(id)
        const text = await blob.slice(0, MAX_TEXT).text()
        if (resource.value?.id === id) previewText.value = text
      } else if (['image', 'pdf', 'video', 'audio'].includes(kind.value)) {
        const url = await resourceObjectUrl(id)
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
    await openResource(props.id)
  } catch (error) {
    notify.error(error, 'Could not open the file')
  }
}

async function download(): Promise<void> {
  const item = resource.value
  if (!item) return
  try {
    downloadUrl(item.name, await resourceObjectUrl(item.id))
  } catch (error) {
    notify.error(error, 'Download failed')
  }
}

async function copyPath(): Promise<void> {
  if (await copyText(path.value)) notify.success('Path copied')
}

const renameOpen = ref(false)
const deleteOpen = ref(false)
const deleteWarning = useBreakWarning(() => (deleteOpen.value ? resource.value : null))
const deleteText = computed(() => {
  const base = `“${resource.value?.name}” will be deleted.`
  return deleteWarning.value ? `${base} ${deleteWarning.value}` : base
})

async function rename(name: string): Promise<void> {
  try {
    const renamed = await tree.renameResource(props.id, name)
    await router.replace({ name: 'resource', params: { id: renamed.id } })
    notify.success('Renamed')
  } catch (error) {
    notify.error(error, 'Rename failed')
  }
}

async function remove(): Promise<void> {
  const parent = tree.parentOf(props.id)
  // read before the delete: afterwards the tree no longer has the file
  const name = resource.value?.name ?? 'file'
  try {
    await tree.deleteResource(props.id)
    notify.success(`Deleted “${name}”`)
    await router.replace(
      parent && parent.id !== tree.root?.id
        ? { name: 'section', params: { id: parent.id } }
        : { name: 'home' },
    )
  } catch (error) {
    notify.error(error, 'Delete failed')
  }
}
</script>

<template>
  <v-container class="resource-view pb-16" max-width="960">
    <template v-if="resource">
      <ItemBreadcrumbs :ancestors="ancestors" />
      <div class="d-flex align-center ga-3 mb-3">
        <v-icon :icon="iconFor(resource)" :color="colorFor(resource)" size="32" />
        <h1 class="text-h5 text-truncate flex-grow-1" data-testid="resource-title">
          {{ resource.name }}
        </h1>
      </div>

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          :prepend-icon="mdiOpenInNew"
          variant="tonal"
          data-testid="resource-open"
          @click="open"
        >
          Open
        </v-btn>
        <v-btn :prepend-icon="mdiDownload" variant="tonal" @click="download">Download</v-btn>
        <v-btn :prepend-icon="mdiContentCopy" variant="text" @click="copyPath">Copy path</v-btn>
        <v-btn
          :prepend-icon="mdiPencil"
          variant="text"
          data-testid="resource-rename"
          @click="renameOpen = true"
        >
          Rename
        </v-btn>
        <v-btn
          :prepend-icon="mdiFolderMoveOutline"
          variant="text"
          data-testid="resource-move"
          @click="moveStore.open(resource)"
        >
          Move
        </v-btn>
        <v-btn
          :prepend-icon="mdiDelete"
          variant="text"
          color="error"
          data-testid="resource-delete"
          @click="deleteOpen = true"
        >
          Delete
        </v-btn>
      </div>

      <v-card variant="outlined" class="mb-4">
        <v-list density="compact" lines="one">
          <v-list-item title="Kind" :subtitle="KIND_LABELS[kind]" />
          <v-list-item title="Size" :subtitle="formatSize(resource.filesize)" />
          <v-list-item v-if="modified" title="Modified" :subtitle="modified" />
          <v-list-item title="Path" :subtitle="path" data-testid="resource-path" />
        </v-list>
      </v-card>

      <v-card variant="outlined" class="mb-4">
        <v-card-subtitle class="pt-3">Used by</v-card-subtitle>
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
        <v-alert v-else-if="previewFailed" type="warning" variant="tonal">
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
        <v-btn color="primary" :to="{ name: 'home' }">To the start page</v-btn>
      </template>
    </v-empty-state>

    <NameDialog
      v-model="renameOpen"
      title="Rename file"
      label="New name"
      :initial="resource?.name"
      @confirm="rename"
    />
    <ConfirmDialog
      v-model="deleteOpen"
      title="Delete?"
      :text="deleteText"
      confirm-text="Delete"
      danger
      @confirm="remove"
    />
  </v-container>
</template>

<style scoped>
.resource-view__preview img,
.resource-view__preview video {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 8px;
  display: block;
}
.resource-view__preview audio {
  width: 100%;
}
.resource-view__pdf {
  width: 100%;
  height: 75vh;
  border-radius: 8px;
}
.resource-view__text {
  font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 12px 14px;
  border-radius: 6px;
  background: rgb(var(--v-theme-code-code-background));
  color: rgb(var(--v-theme-code-text));
  max-height: 70vh;
  overflow: auto;
}
</style>
