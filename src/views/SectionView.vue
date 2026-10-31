<script setup lang="ts">
import {
  mdiDelete,
  mdiDotsVertical,
  mdiFileDocumentPlusOutline,
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
import { formatSize, iconFor } from '@/services/icons'
import { stripMarkdownExtension } from '@/services/names'
import { openResource } from '@/services/resources'
import { useLiveStore } from '@/stores/live'
import { useNotifyStore } from '@/stores/notify'
import { sortByName, useTreeStore } from '@/stores/tree'

const props = defineProps<{ id?: string }>()

const tree = useTreeStore()
const live = useLiveStore()
const notify = useNotifyStore()
const router = useRouter()

const section = computed(() =>
  props.id === undefined ? tree.root : (tree.section(props.id) ?? null),
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

const typeLabel = { section: 'Ordner', document: 'Seite', resource: 'Datei' } as const

function subtitle(item: TreeItem): string {
  if (item.type === 'section') {
    const count = item.documents.length + item.subsections.length
    return count === 1 ? '1 Eintrag' : `${count} Einträge`
  }
  if (item.type === 'resource') return formatSize(item.filesize)
  return ''
}

function linkTo(item: TreeItem) {
  if (item.type === 'section') return { name: 'section', params: { id: item.id } }
  if (item.type === 'document') return { name: 'document', params: { id: item.id } }
  return undefined
}

async function open(item: TreeItem): Promise<void> {
  if (item.type !== 'resource') return
  try {
    await openResource(item.id)
  } catch (error) {
    notify.error(error, 'Datei konnte nicht geöffnet werden')
  }
}

// create / rename / delete
const createKind = ref<'section' | 'document' | null>(null)
const createOpen = computed({
  get: () => createKind.value !== null,
  set: (open) => {
    if (!open) createKind.value = null
  },
})
const renameTarget = ref<TreeItem | null>(null)
const renameOpen = computed({
  get: () => renameTarget.value !== null,
  set: (open) => {
    if (!open) renameTarget.value = null
  },
})
const deleteTarget = ref<TreeItem | null>(null)
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (open) => {
    if (!open) deleteTarget.value = null
  },
})

async function create(name: string): Promise<void> {
  const parent = section.value
  const kind = createKind.value
  if (!parent || !kind) return
  try {
    if (kind === 'section') {
      await tree.createSection(parent.id, name)
      notify.success(`Ordner „${name}“ angelegt`)
    } else {
      const doc = await tree.createDocument(parent.id, stripMarkdownExtension(name))
      await router.push({ name: 'document', params: { id: doc.id } })
    }
  } catch (error) {
    notify.error(error, 'Anlegen fehlgeschlagen')
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
    notify.success('Umbenannt')
  } catch (error) {
    notify.error(error, 'Umbenennen fehlgeschlagen')
  }
}

// Deleting a page somebody has open fails with 409; the user can then force it.
const forceTarget = ref<TreeItem | null>(null)
const forceOpen = computed({
  get: () => forceTarget.value !== null,
  set: (open) => {
    if (!open) forceTarget.value = null
  },
})

async function remove(item = deleteTarget.value, force = false): Promise<void> {
  if (!item) return
  try {
    if (item.type === 'section') await tree.deleteSection(item.id, force)
    else if (item.type === 'document') await tree.deleteDocument(item.id, force)
    else await tree.deleteResource(item.id)
    notify.success(`„${item.name}“ gelöscht`)
  } catch (error) {
    if (!force && error instanceof ApiError && error.status === 409) forceTarget.value = item
    else notify.error(error, 'Löschen fehlgeschlagen')
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
      created.length === 1
        ? `„${created[0]!.name}“ hochgeladen`
        : `${created.length} Dateien hochgeladen`,
    )
  } catch (error) {
    notify.error(error, 'Hochladen fehlgeschlagen')
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

const deleteText = computed(() => {
  const item = deleteTarget.value
  if (!item) return ''
  if (item.type === 'section')
    return `Der Ordner „${item.name}“ wird mit allem, was darin liegt, gelöscht.`
  return `„${item.name}“ wird gelöscht.`
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
        aria-label="Dateien werden hochgeladen"
        data-testid="upload-progress"
      />
      <div v-if="dragging" class="section-view__drop text-body-1 mb-2" data-testid="drop-zone">
        Dateien hier ablegen, um sie in diesen Ordner hochzuladen
      </div>

      <v-list v-if="entries.length > 0" lines="one" class="rounded-lg" border>
        <v-list-item
          v-for="item in entries"
          :key="item.id"
          :to="linkTo(item)"
          :title="item.name"
          :subtitle="subtitle(item)"
          :prepend-icon="iconFor(item)"
          :data-testid="`entry-${item.type}`"
          @click="open(item)"
        >
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
                  :aria-label="`Aktionen für ${item.name}`"
                  @click.stop.prevent
                />
              </template>
              <v-list density="compact">
                <v-list-item
                  :prepend-icon="mdiPencil"
                  title="Umbenennen"
                  @click="renameTarget = item"
                />
                <v-list-item
                  :prepend-icon="mdiDelete"
                  title="Löschen"
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
        title="Hier ist noch nichts"
        text="Lege mit dem Plus-Knopf eine Seite oder einen Ordner an, oder lade Dateien hoch."
      />

      <v-menu location="top end">
        <template #activator="{ props: menuProps }">
          <v-fab
            v-bind="menuProps"
            :icon="mdiPlus"
            color="primary"
            class="section-view__fab"
            size="large"
            aria-label="Neu"
            data-testid="create-fab"
          />
        </template>
        <v-list>
          <v-list-item
            :prepend-icon="mdiFileDocumentPlusOutline"
            title="Neue Seite"
            data-testid="create-document"
            @click="createKind = 'document'"
          />
          <v-list-item
            :prepend-icon="mdiFolderPlusOutline"
            title="Neuer Ordner"
            data-testid="create-section"
            @click="createKind = 'section'"
          />
          <v-list-item
            :prepend-icon="mdiUpload"
            title="Dateien hochladen"
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
      v-else-if="!tree.loading && tree.root"
      title="Nicht gefunden"
      text="Diesen Ordner gibt es nicht (mehr)."
    >
      <template #actions>
        <v-btn color="primary" :to="{ name: 'home' }">Zur Startseite</v-btn>
      </template>
    </v-empty-state>

    <NameDialog
      v-model="createOpen"
      :title="createKind === 'section' ? 'Neuer Ordner' : 'Neue Seite'"
      label="Name"
      confirm-text="Anlegen"
      @confirm="create"
    />
    <NameDialog
      v-model="renameOpen"
      :title="renameTarget ? `${typeLabel[renameTarget.type]} umbenennen` : ''"
      label="Neuer Name"
      :initial="renameTarget?.name"
      @confirm="rename"
    />
    <ConfirmDialog
      v-model="deleteOpen"
      title="Wirklich löschen?"
      :text="deleteText"
      confirm-text="Löschen"
      danger
      @confirm="remove()"
    />
    <ConfirmDialog
      v-model="forceOpen"
      title="Wird gerade bearbeitet"
      text="Jemand hat das gerade geöffnet. Wenn du trotzdem löschst, bekommt diese Person einen Hinweis und kann ihren Text noch kopieren."
      confirm-text="Trotzdem löschen"
      danger
      @confirm="remove(forceTarget, true)"
    />
  </v-container>
</template>

<style scoped>
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
