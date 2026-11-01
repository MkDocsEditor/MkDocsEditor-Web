<script setup lang="ts">
import {
  mdiDelete,
  mdiDotsVertical,
  mdiOpenInNew,
  mdiFileDocumentPlusOutline,
  mdiFolderMoveOutline,
  mdiFolderPlusOutline,
  mdiPencil,
  mdiPlus,
  mdiUpload,
} from '@mdi/js'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api'
import type { TreeItem } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import OnlineAvatars from '@/components/common/OnlineAvatars.vue'
import NameDialog from '@/components/common/NameDialog.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import ResourceThumb from '@/components/resources/ResourceThumb.vue'
import { openWhileSet } from '@/services/dialogTarget'
import { colorFor, formatSize, iconFor } from '@/services/icons'
import { stripMarkdownExtension } from '@/services/names'
import { openResource } from '@/services/resources'
import { useLiveStore } from '@/stores/live'
import { useBreakWarning } from '@/components/references/backlinks'
import { useMovedRedirect } from '@/services/redirects'
import { useMoveStore } from '@/stores/move'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { sortByName } from '@/stores/treeIndex'

const props = defineProps<{ id?: string }>()

const tree = useTreeStore()
const live = useLiveStore()
const notify = useNotifyStore()
const router = useRouter()

const section = computed(() =>
  props.id === undefined ? tree.root : (tree.section(props.id) ?? null),
)
const moveStore = useMoveStore()
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

const typeLabel = { section: 'Folder', document: 'Page', resource: 'File' } as const

function subtitle(item: TreeItem): string {
  if (item.type === 'section') {
    const count = item.documents.length + item.subsections.length
    return count === 1 ? '1 item' : `${count} items`
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
    await openResource(item.id)
  } catch (error) {
    notify.error(error, 'Could not open the file')
  }
}

// create / rename / delete
const createKind = ref<'section' | 'document' | null>(null)
const createOpen = openWhileSet(createKind)
const renameTarget = ref<TreeItem | null>(null)
const renameOpen = openWhileSet(renameTarget)
const deleteTarget = ref<TreeItem | null>(null)
const deleteOpen = openWhileSet(deleteTarget)

async function create(name: string): Promise<void> {
  const parent = section.value
  const kind = createKind.value
  if (!parent || !kind) return
  try {
    if (kind === 'section') {
      await tree.createSection(parent.id, name)
      notify.success(`Created folder “${name}”`)
    } else {
      const doc = await tree.createDocument(parent.id, stripMarkdownExtension(name))
      await router.push({ name: 'document', params: { id: doc.id } })
    }
  } catch (error) {
    notify.error(error, 'Create failed')
  }
}

async function rename(name: string): Promise<void> {
  const item = renameTarget.value
  if (!item) return
  try {
    if (item.type === 'section') await tree.renameSection(item.id, name)
    else if (item.type === 'document')
      await tree.renameDocument(item.id, stripMarkdownExtension(name))
    else await tree.renameResource(item.id, name)
    notify.success('Renamed')
  } catch (error) {
    notify.error(error, 'Rename failed')
  }
}

// Deleting a page somebody has open fails with 409; the user can then force it.
const forceTarget = ref<TreeItem | null>(null)
const forceOpen = openWhileSet(forceTarget)

async function remove(item = deleteTarget.value, force = false): Promise<void> {
  if (!item) return
  try {
    if (item.type === 'section') await tree.deleteSection(item.id, force)
    else if (item.type === 'document') await tree.deleteDocument(item.id, force)
    else await tree.deleteResource(item.id)
    notify.success(`Deleted “${item.name}”`)
  } catch (error) {
    if (!force && error instanceof ApiError && error.status === 409) forceTarget.value = item
    else notify.error(error, 'Delete failed')
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
    notify.error(error, 'Upload failed')
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

const deleteWarning = useBreakWarning(() => deleteTarget.value)

const deleteText = computed(() => {
  const item = deleteTarget.value
  if (!item) return ''
  const base =
    item.type === 'section'
      ? `The folder “${item.name}” is deleted with everything in it.`
      : `“${item.name}” will be deleted.`
  return deleteWarning.value ? `${base} ${deleteWarning.value}` : base
})
</script>

<template>
  <v-container
    class="section-view pb-16"
    :class="{ 'section-view--dragging': dragging }"
    max-width="960"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <template v-if="section">
      <ItemBreadcrumbs v-if="!isRoot" :ancestors="ancestors" />
      <h1 class="text-h5 mb-2" data-testid="section-title">{{ title }}</h1>
      <v-progress-linear
        v-if="uploading"
        indeterminate
        color="primary"
        class="mb-2"
        aria-label="Uploading files"
        data-testid="upload-progress"
      />
      <div v-if="dragging" class="section-view__drop text-body-1 mb-2" data-testid="drop-zone">
        Drop files here to upload them into this folder
      </div>

      <v-list v-if="entries.length > 0" lines="one" class="rounded-lg" border>
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
            <v-menu>
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  :icon="mdiDotsVertical"
                  variant="text"
                  size="small"
                  :aria-label="`Actions for ${item.name}`"
                  @click.stop.prevent
                />
              </template>
              <v-list density="compact">
                <v-list-item
                  v-if="item.type === 'resource'"
                  :prepend-icon="mdiOpenInNew"
                  title="Open in a new tab"
                  @click="open(item)"
                />
                <v-list-item
                  :prepend-icon="mdiPencil"
                  title="Rename"
                  @click="renameTarget = item"
                />
                <v-list-item
                  :prepend-icon="mdiFolderMoveOutline"
                  title="Move to…"
                  data-testid="entry-move"
                  @click="moveStore.open(item)"
                />
                <v-list-item
                  :prepend-icon="mdiDelete"
                  title="Delete"
                  base-color="error"
                  @click="deleteTarget = item"
                />
              </v-list>
            </v-menu>
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
        <v-btn color="primary" :to="{ name: 'home' }">To the start page</v-btn>
      </template>
    </v-empty-state>

    <NameDialog
      v-model="createOpen"
      :title="createKind === 'section' ? 'New folder' : 'New page'"
      label="Name"
      confirm-text="Anlegen"
      @confirm="create"
    />
    <NameDialog
      v-model="renameOpen"
      :title="renameTarget ? `Rename ${typeLabel[renameTarget.type].toLowerCase()}` : ''"
      label="New name"
      :initial="renameTarget?.name"
      @confirm="rename"
    />
    <ConfirmDialog
      v-model="deleteOpen"
      title="Delete?"
      :text="deleteText"
      confirm-text="Delete"
      danger
      @confirm="remove()"
    />
    <ConfirmDialog
      v-model="forceOpen"
      title="Being edited right now"
      text="Someone has this open right now. If you delete it anyway, they get a notice and can still copy their text."
      confirm-text="Delete anyway"
      danger
      @confirm="remove(forceTarget, true)"
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
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  color: rgb(var(--v-theme-primary));
}
.section-view--dragging {
  min-height: 60vh;
}
.section-view__fab {
  position: fixed;
  right: calc(16px + env(safe-area-inset-right));
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 5;
}
</style>
