<script setup lang="ts">
import { mdiAlertCircleOutline, mdiOpenInNew, mdiPlus, mdiUpload } from '@mdi/js'
import { computed, ref } from 'vue'

import type { ResourceModel } from '@/api'
import { findReferences } from '@/markdown/references'
import { useDebounced } from '@/services/debounced'
import type { TextReference } from '@/markdown/references'
import { formatSize } from '@/services/icons'
import { useTreeStore } from '@/stores/tree'
import { sortByName } from '@/stores/treeIndex'

import ResourceThumb from './ResourceThumb.vue'

/**
 * The files of the open page: the ones it uses (from its live text), broken references, and
 * the other files of its folder, which a click inserts at the cursor.
 */
const props = defineProps<{
  text: string
  documentId: string
  readOnly?: boolean
  uploading?: boolean
}>()
const emit = defineEmits<{
  /** Insert a file at the cursor. */
  insert: [resource: ResourceModel]
  /** Upload files into the page's folder and insert them. */
  upload: [files: File[]]
  /** Select a reference in the editor. */
  reveal: [reference: TextReference]
}>()

const tree = useTreeStore()
const section = computed(() => tree.parentOf(props.documentId))

/** Recomputed at most every 300 ms while typing. */
const debounced = useDebounced(() => props.text, 300)
const references = computed(() => findReferences(debounced.value))

interface Used {
  resource: ResourceModel
  reference: TextReference
  count: number
}

const resolved = computed(() => {
  const used = new Map<string, Used>()
  const broken: TextReference[] = []
  const folder = section.value
  if (!folder) return { used: [], broken }
  for (const reference of references.value) {
    const target = tree.resolve(folder.id, reference.destination)
    if (!target) broken.push(reference)
    else if (target.type === 'resource') {
      const entry = used.get(target.id)
      if (entry) entry.count++
      else used.set(target.id, { resource: target, reference, count: 1 })
    }
  }
  return { used: [...used.values()], broken }
})

const others = computed(() => {
  const usedIds = new Set(resolved.value.used.map((u) => u.resource.id))
  return sortByName(section.value?.resources ?? []).filter((r) => !usedIds.has(r.id))
})

const fileInput = ref<HTMLInputElement | null>(null)
function onFilesChosen(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length > 0) emit('upload', files)
}
</script>

<template>
  <div class="resources-panel" data-testid="resources-panel">
    <div class="d-flex align-center px-4 pt-3 pb-1">
      <h2 class="text-subtitle-1 font-weight-medium flex-grow-1">Files</h2>
      <v-btn
        v-if="!readOnly"
        :prepend-icon="mdiUpload"
        :loading="uploading"
        variant="tonal"
        size="small"
        data-testid="panel-upload"
        @click="fileInput?.click()"
      >
        Upload
      </v-btn>
      <input
        ref="fileInput"
        type="file"
        multiple
        hidden
        data-testid="panel-file-input"
        @change="onFilesChosen"
      />
    </div>

    <v-list density="compact" class="py-0">
      <v-list-subheader>Used on this page</v-list-subheader>
      <v-list-item
        v-for="entry in resolved.used"
        :key="entry.resource.id"
        :title="entry.resource.name"
        :subtitle="
          entry.count > 1
            ? `${entry.count} times, first in line ${entry.reference.line}`
            : `Line ${entry.reference.line}`
        "
        data-testid="panel-used"
        @click="emit('reveal', entry.reference)"
      >
        <template #prepend>
          <ResourceThumb :resource="entry.resource" :size="36" class="me-3" />
        </template>
        <template #append>
          <v-btn
            :icon="mdiOpenInNew"
            :to="{ name: 'resource', params: { id: entry.resource.id } }"
            variant="text"
            size="small"
            :aria-label="`Show ${entry.resource.name}`"
            @click.stop
          />
        </template>
      </v-list-item>
      <v-list-item
        v-if="resolved.used.length === 0"
        subtitle="This page uses no files yet."
        class="text-medium-emphasis"
      />

      <template v-if="resolved.broken.length > 0">
        <v-list-subheader>Not found</v-list-subheader>
        <v-list-item
          v-for="reference in resolved.broken"
          :key="reference.from"
          :title="reference.destination"
          :subtitle="`Line ${reference.line}`"
          :prepend-icon="mdiAlertCircleOutline"
          base-color="error"
          data-testid="panel-broken"
          @click="emit('reveal', reference)"
        />
      </template>

      <v-list-subheader>In this folder</v-list-subheader>
      <v-list-item
        v-for="resource in others"
        :key="resource.id"
        :title="resource.name"
        :subtitle="formatSize(resource.filesize)"
        :disabled="readOnly"
        data-testid="panel-folder"
        @click="emit('insert', resource)"
      >
        <template #prepend>
          <ResourceThumb :resource="resource" :size="36" class="me-3" />
        </template>
        <template #append>
          <v-icon :icon="mdiPlus" size="small" :aria-label="`Insert ${resource.name}`" />
        </template>
      </v-list-item>
      <v-list-item
        v-if="others.length === 0"
        subtitle="No other files in this folder."
        class="text-medium-emphasis"
      />
    </v-list>
    <slot name="footer" />
  </div>
</template>

<style scoped>
.resources-panel {
  height: 100%;
  overflow-y: auto;
}
</style>
