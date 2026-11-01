<script setup lang="ts">
import { mdiUpload } from '@mdi/js'
import { computed, ref, watch } from 'vue'

import type { TreeItem } from '@/api'
import TreeBrowser from '@/components/tree/TreeBrowser.vue'
import { resourceKind } from '@/services/icons'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

import { cleanUrl, escapeLinkText, markdownLink } from './markdown'

/**
 * Picks an image or file for the page: an existing one from anywhere in the wiki, a new upload
 * into a folder of choice (the page's folder by default), or a web address. Emits Markdown with
 * the right relative path: `![alt](path)` for images, `[name](path)` for other files.
 */
const props = defineProps<{
  documentId: string
  /** The selected text, which becomes the alt text. */
  selection: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ insert: [snippets: string[]] }>()

const tree = useTreeStore()
const notify = useNotifyStore()
const tab = ref<'wiki' | 'upload' | 'web'>('wiki')
const altText = ref('')
const imagesOnly = ref(true)
const browseSection = ref('')
const uploadSection = ref('')
const url = ref('')
const uploading = ref(false)

const pageFolder = computed(() => tree.parentOf(props.documentId)?.id ?? tree.root?.id ?? '')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    tab.value = 'wiki'
    altText.value = props.selection
    browseSection.value = pageFolder.value
    uploadSection.value = pageFolder.value
    url.value = ''
  },
  { immediate: true },
)

const imageFilter = (item: TreeItem) =>
  !imagesOnly.value || (item.type === 'resource' && resourceKind(item) === 'image')

function pick(item: TreeItem): void {
  emit('insert', [markdownLink(tree, props.documentId, item, { text: altText.value })])
  open.value = false
}

const uploadPath = computed(() => {
  const path = tree.path(uploadSection.value)
  return path === '' ? 'Wiki (top folder)' : path
})
const fileInput = ref<HTMLInputElement | null>(null)

async function onFilesChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  uploading.value = true
  try {
    const created = await tree.uploadFiles(uploadSection.value, files)
    const text = files.length === 1 ? altText.value : ''
    emit(
      'insert',
      created.map((resource) => markdownLink(tree, props.documentId, resource, { text })),
    )
    open.value = false
  } catch (error) {
    notify.error(error, 'Upload failed')
  } finally {
    uploading.value = false
  }
}

const webValid = computed(() => url.value.trim() !== '')
function insertWeb(): void {
  if (!webValid.value) return
  const address = cleanUrl(url.value)
  const alt = escapeLinkText(altText.value.trim() || url.value.trim().split(/[/?#]/).filter(Boolean).pop() || 'image')
  emit('insert', [`![${alt}](${address})`])
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" :fullscreen="$vuetify.display.xs" scrollable>
    <v-card data-testid="resource-picker">
      <v-card-title>Insert image or file</v-card-title>
      <v-tabs v-model="tab" density="compact" class="px-4">
        <v-tab value="wiki" data-testid="resource-tab-wiki">In the wiki</v-tab>
        <v-tab value="upload" data-testid="resource-tab-upload">Upload</v-tab>
        <v-tab value="web" data-testid="resource-tab-web">Web address</v-tab>
      </v-tabs>
      <v-card-text class="resource-picker__body">
        <v-text-field
          v-model="altText"
          label="Description (alt text)"
          placeholder="From the file name"
          persistent-placeholder
          density="compact"
          hide-details
          class="mb-2"
          data-testid="resource-alt"
        />
        <template v-if="tab === 'wiki'">
          <v-switch
            v-model="imagesOnly"
            label="Images only"
            density="compact"
            color="primary"
            hide-details
            class="mb-1"
            data-testid="resource-images-only"
          />
          <TreeBrowser
            v-model:section="browseSection"
            :types="['resource']"
            :filter="imageFilter"
            search-placeholder="Search files…"
            @pick="pick"
          />
        </template>
        <template v-else-if="tab === 'upload'">
          <p class="text-body-2 mb-2">
            Upload into <strong data-testid="upload-target">{{ uploadPath }}</strong>
          </p>
          <v-btn
            :prepend-icon="mdiUpload"
            color="primary"
            :loading="uploading"
            class="mb-3"
            data-testid="resource-choose-files"
            @click="fileInput?.click()"
          >
            Choose files
          </v-btn>
          <input
            ref="fileInput"
            type="file"
            multiple
            hidden
            data-testid="resource-file-input"
            @change="onFilesChosen"
          />
          <p class="text-caption text-medium-emphasis mb-1">Pick another folder:</p>
          <TreeBrowser
            v-model:section="uploadSection"
            :types="[]"
            search-placeholder="Search folders…"
          />
        </template>
        <v-form v-else @submit.prevent="insertWeb">
          <v-text-field
            v-model="url"
            label="Image address"
            placeholder="https://"
            type="url"
            autofocus
            data-testid="resource-url"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          v-if="tab === 'web'"
          color="primary"
          variant="flat"
          :disabled="!webValid"
          data-testid="resource-insert-web"
          @click="insertWeb"
        >
          Insert
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.resource-picker__body {
  min-height: 360px;
}
</style>
