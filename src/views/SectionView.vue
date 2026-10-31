<script setup lang="ts">
import {
  mdiDelete,
  mdiDotsVertical,
  mdiFileDocumentPlusOutline,
  mdiFolderPlusOutline,
  mdiPencil,
  mdiPlus,
} from '@mdi/js'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { TreeItem } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import NameDialog from '@/components/common/NameDialog.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import { formatSize, iconFor } from '@/services/icons'
import { stripMarkdownExtension } from '@/services/names'
import { openResource } from '@/services/resources'
import { useNotifyStore } from '@/stores/notify'
import { sortByName, useTreeStore } from '@/stores/tree'

const props = defineProps<{ id?: string }>()

const tree = useTreeStore()
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

async function remove(): Promise<void> {
  const item = deleteTarget.value
  if (!item) return
  try {
    if (item.type === 'section') await tree.deleteSection(item.id)
    else if (item.type === 'document') await tree.deleteDocument(item.id)
    else await tree.deleteResource(item.id)
    notify.success(`„${item.name}“ gelöscht`)
  } catch (error) {
    notify.error(error, 'Löschen fehlgeschlagen')
  }
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
  <v-container class="section-view pb-16" max-width="960">
    <template v-if="section">
      <ItemBreadcrumbs v-if="!isRoot" :ancestors="ancestors" />
      <h1 class="text-h5 mb-2" data-testid="section-title">{{ title }}</h1>

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
        text="Lege mit dem Plus-Knopf eine Seite oder einen Ordner an."
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
        </v-list>
      </v-menu>
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
      @confirm="remove"
    />
  </v-container>
</template>

<style scoped>
.section-view__fab {
  position: fixed;
  right: calc(16px + env(safe-area-inset-right));
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 5;
}
</style>
