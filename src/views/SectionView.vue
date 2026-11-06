<script setup lang="ts">
import {
  mdiOpenInNew,
  mdiFileDocumentPlusOutline,
  mdiFolderPlusOutline,
  mdiPlus,
  mdiUpload,
} from '@mdi/js'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { TreeItem } from '@/api'
import PageHeader from '@/components/common/PageHeader.vue'
import OnlineAvatars from '@/components/common/OnlineAvatars.vue'
import NameDialog from '@/components/common/NameDialog.vue'
import ItemActionsMenu from '@/components/tree/ItemActionsMenu.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import SyncStatus from '@/components/tree/SyncStatus.vue'
import ResourceThumb from '@/components/resources/ResourceThumb.vue'
import { openWhileSet } from '@/services/dialogTarget'
import { colorFor, formatSize, iconFor } from '@/services/icons'
import { plural, stripMarkdownExtension } from '@/services/names'
import { openFile } from '@/composables/useOpenFile'
import { useLiveStore } from '@/stores/live'
import { useMovedRedirect } from '@/composables/useMovedRedirect'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { sortByName } from '@/services/treeIndex'

const props = defineProps<{ id?: string }>()

const tree = useTreeStore()
const live = useLiveStore()
const notify = useNotifyStore()
const router = useRouter()

const section = computed(() =>
  props.id === undefined ? tree.root : (tree.section(props.id) ?? null),
)
const lookingUp = useMovedRedirect(
  () => props.id ?? '',
  'section',
  () => props.id !== undefined && !!tree.root && !tree.loading && section.value === null,
)
const isRoot = computed(() => section.value !== null && section.value.id === tree.root?.id)
const ancestors = computed(() => (section.value ? tree.ancestors(section.value.id) : []))
const title = computed(() => (isRoot.value ? 'Wiki' : (section.value?.name ?? '')))

const entries = computed<TreeItem[]>(() =>
  section.value
    ? [
        ...sortByName(section.value.subsections),
        ...sortByName(section.value.documents),
        ...sortByName(section.value.resources),
      ]
    : [],
)

function subtitle(item: TreeItem): string {
  if (item.type === 'section') {
    const count = item.documents.length + item.subsections.length
    return plural(count, 'item')
  }
  if (item.type === 'resource') return formatSize(item.filesize)
  return ''
}

/** The routes are named like the item types. */
function linkTo(item: TreeItem) {
  return { name: item.type, params: { id: item.id } }
}

async function open(item: TreeItem): Promise<void> {
  try {
    await openFile(item.id, item.name)
  } catch (error) {
    notify.error(error, 'Could not open the file', () => void open(item))
  }
}

// create
const createKind = ref<'section' | 'document' | null>(null)
const createOpen = openWhileSet(createKind)

async function create(name: string): Promise<void> {
  const parent = section.value
  const kind = createKind.value
  if (!parent || !kind) return
  if (kind === 'section') {
    await tree.createSection(parent.id, name)
    notify.success(`Created folder “${name}”`)
  } else {
    const doc = await tree.createDocument(parent.id, stripMarkdownExtension(name))
    await router.push({ name: 'document', params: { id: doc.id } })
  }
}

// uploads: from the menu or by dropping files onto the list
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const dragging = ref(false)
let dragDepth = 0

async function upload(files: File[]): Promise<void> {
  const target = section.value
  if (!target || files.length === 0) return
  uploading.value = true
  try {
    const created = await tree.uploadFiles(target.id, files)
    notify.success(
      created.length === 1 ? `Uploaded “${created[0]!.name}”` : `Uploaded ${created.length} files`,
    )
  } catch (error) {
    notify.error(error, 'Upload failed', () => void upload(files))
  } finally {
    uploading.value = false
  }
}

function onFilesChosen(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  void upload(files)
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

function onDragEnter(event: DragEvent): void {
  if (!hasFiles(event)) return
  dragDepth++
  dragging.value = true
}

function onDragLeave(event: DragEvent): void {
  if (!hasFiles(event)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDrop(event: DragEvent): void {
  dragDepth = 0
  dragging.value = false
  void upload(Array.from(event.dataTransfer?.files ?? []))
}
</script>

<template>
  <v-container
    class="section-view pb-16"
    :class="{ 'section-view--dragging': dragging }"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <template v-if="section">
      <ItemBreadcrumbs v-if="!isRoot" :ancestors="ancestors" />
      <PageHeader :title="title" testid="section-title">
        <template v-if="!isRoot" #actions>
          <ItemActionsMenu :item="section" size="default" />
        </template>
        <SyncStatus class="mt-1" />
      </PageHeader>
      <v-progress-linear
        v-if="uploading"
        indeterminate
        class="mb-2"
        aria-label="Uploading files"
        data-testid="upload-progress"
      />
      <div v-if="dragging" class="section-view__drop text-body-large mb-2" data-testid="drop-zone">
        Drop files here to upload them into this folder
      </div>

      <v-list v-if="entries.length > 0" lines="one" class="app-card-list py-0">
        <v-list-item
          v-for="item in entries"
          :key="item.id"
          :to="linkTo(item)"
          :title="item.name"
          :subtitle="subtitle(item)"
          :data-testid="`entry-${item.type}`"
        >
          <template #prepend>
            <ResourceThumb
              v-if="item.type === 'resource'"
              :resource="item"
              :size="36"
              class="me-4"
            />
            <span v-else class="section-view__icon me-4">
              <v-icon :icon="iconFor(item)" :color="colorFor(item)" />
            </span>
          </template>
          <template #append>
            <OnlineAvatars
              v-if="item.type === 'document'"
              :users="live.usersOf(item.id)"
              class="mr-1"
            />
            <ItemActionsMenu :item="item">
              <v-list-item
                v-if="item.type === 'resource'"
                :prepend-icon="mdiOpenInNew"
                title="Open in a new tab"
                @click="open(item)"
              />
            </ItemActionsMenu>
          </template>
        </v-list-item>
      </v-list>
      <v-empty-state
        v-else
        title="Nothing here yet"
        text="Use the plus button to create a page or a folder, or upload files."
      />

      <v-menu location="top end">
        <template #activator="{ props: menuProps }">
          <v-fab
            v-bind="menuProps"
            :icon="mdiPlus"
            color="primary"
            class="section-view__fab"
            size="large"
            aria-label="New"
            data-testid="create-fab"
          />
        </template>
        <v-list>
          <v-list-item
            :prepend-icon="mdiFileDocumentPlusOutline"
            title="New page"
            data-testid="create-document"
            @click="createKind = 'document'"
          />
          <v-list-item
            :prepend-icon="mdiFolderPlusOutline"
            title="New folder"
            data-testid="create-section"
            @click="createKind = 'section'"
          />
          <v-list-item
            :prepend-icon="mdiUpload"
            title="Upload files"
            data-testid="upload-files"
            @click="fileInput?.click()"
          />
        </v-list>
      </v-menu>
      <input
        ref="fileInput"
        type="file"
        multiple
        hidden
        data-testid="file-input"
        @change="onFilesChosen"
      />
    </template>

    <v-empty-state
      v-else-if="!tree.loading && tree.root && !lookingUp"
      title="Not found"
      text="This folder does not exist (any more)."
    >
      <template #actions>
        <v-btn color="primary" variant="flat" :to="{ name: 'home' }">To the start page</v-btn>
      </template>
    </v-empty-state>

    <NameDialog
      v-model="createOpen"
      :title="createKind === 'section' ? 'New folder' : 'New page'"
      label="Name"
      confirm-text="Create"
      :save="create"
    />
  </v-container>
</template>

<style scoped>
.section-view__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}
.section-view__drop {
  border: 2px dashed rgb(var(--v-theme-primary));
  border-radius: var(--md-sys-shape-corner-small);
  padding: var(--app-space-6) var(--app-space-4);
  text-align: center;
  color: rgb(var(--v-theme-primary));
}
.section-view--dragging {
  min-height: 60vh;
}
.section-view__fab {
  position: fixed;
  right: calc(var(--app-space-4) + env(safe-area-inset-right));
  bottom: calc(var(--app-space-4) + env(safe-area-inset-bottom));
  z-index: 5;
}
</style>
