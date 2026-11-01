<script setup lang="ts">
import { mdiChevronDown, mdiChevronRight } from '@mdi/js'
import { computed } from 'vue'

import type { SectionModel, TreeItem } from '@/api'
import { colorFor, iconFor } from '@/services/icons'
import { useMoveStore } from '@/stores/move'
import { sortByName, useTreeStore } from '@/stores/tree'

import { canDropInto, dragged, dropTarget } from './dragState'

const props = defineProps<{
  section: SectionModel
  depth: number
  activeId?: string
  opened: Set<string>
  /** Also list the files (resources) of each folder. */
  showFiles?: boolean
}>()
const emit = defineEmits<{ toggle: [id: string]; navigate: [] }>()

const subsections = computed(() => sortByName(props.section.subsections))
const documents = computed(() => sortByName(props.section.documents))
const resources = computed(() => (props.showFiles ? sortByName(props.section.resources) : []))
const indent = computed(() => ({ paddingInlineStart: `${8 + props.depth * 16}px` }))

// Drag and drop: drag any item onto a folder to move it there (the move dialog opens with a
// preview of the link changes).
const tree = useTreeStore()
const move = useMoveStore()

function onDragStart(event: DragEvent, item: TreeItem): void {
  dragged.value = item
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.name)
  }
}

function onDragEnd(): void {
  dragged.value = null
  dropTarget.value = null
}

function onDragOver(event: DragEvent, section: SectionModel): void {
  if (!canDropInto(tree, dragged.value, section.id)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = section.id
}

function onDragLeave(section: SectionModel): void {
  if (dropTarget.value === section.id) dropTarget.value = null
}

function onDrop(event: DragEvent, section: SectionModel): void {
  const item = dragged.value
  onDragEnd()
  if (!canDropInto(tree, item, section.id)) return
  event.preventDefault()
  move.open(item, section.id)
}
</script>

<template>
  <template v-for="sub in subsections" :key="sub.id">
    <v-list-item
      :to="{ name: 'section', params: { id: sub.id } }"
      :active="sub.id === activeId"
      :style="indent"
      density="compact"
      :title="sub.name"
      :class="{ 'nav-tree__drop': dropTarget === sub.id }"
      draggable="true"
      data-testid="tree-section"
      @click="emit('navigate')"
      @dragstart="onDragStart($event, sub)"
      @dragend="onDragEnd"
      @dragover="onDragOver($event, sub)"
      @dragleave="onDragLeave(sub)"
      @drop="onDrop($event, sub)"
    >
      <template #prepend>
        <v-btn
          :icon="opened.has(sub.id) ? mdiChevronDown : mdiChevronRight"
          variant="text"
          size="x-small"
          :aria-label="opened.has(sub.id) ? 'Collapse' : 'Expand'"
          @click.stop.prevent="emit('toggle', sub.id)"
        />
        <v-icon :icon="iconFor(sub)" :color="colorFor(sub)" size="small" class="me-2" />
      </template>
    </v-list-item>
    <NavTree
      v-if="opened.has(sub.id)"
      :section="sub"
      :depth="depth + 1"
      :active-id="activeId"
      :opened="opened"
      :show-files="showFiles"
      @toggle="(id: string) => emit('toggle', id)"
      @navigate="emit('navigate')"
    />
  </template>
  <v-list-item
    v-for="doc in documents"
    :key="doc.id"
    :to="{ name: 'document', params: { id: doc.id } }"
    :active="doc.id === activeId"
    :style="indent"
    density="compact"
    :title="doc.name"
    draggable="true"
    data-testid="tree-document"
    @click="emit('navigate')"
    @dragstart="onDragStart($event, doc)"
    @dragend="onDragEnd"
  >
    <template #prepend>
      <span class="nav-tree__spacer" />
      <v-icon :icon="iconFor(doc)" :color="colorFor(doc)" size="small" class="me-2" />
    </template>
  </v-list-item>
  <v-list-item
    v-for="resource in resources"
    :key="resource.id"
    :to="{ name: 'resource', params: { id: resource.id } }"
    :active="resource.id === activeId"
    :style="indent"
    density="compact"
    class="nav-tree__file"
    :title="resource.name"
    draggable="true"
    data-testid="tree-resource"
    @click="emit('navigate')"
    @dragstart="onDragStart($event, resource)"
    @dragend="onDragEnd"
  >
    <template #prepend>
      <span class="nav-tree__spacer" />
      <v-icon :icon="iconFor(resource)" :color="colorFor(resource)" size="small" class="me-2" />
    </template>
  </v-list-item>
</template>

<style scoped>
:deep(.v-list-item__spacer) {
  width: 4px !important;
}
.nav-tree__spacer {
  display: inline-block;
  width: 28px;
}
/* A folder that accepts the dragged item. */
.nav-tree__drop {
  outline: 2px dashed rgb(var(--v-theme-primary));
  outline-offset: -2px;
  background: rgba(var(--v-theme-primary), 0.08);
}
/* Files are secondary in the tree: smaller and quieter than pages. */
.nav-tree__file :deep(.v-list-item-title) {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
</style>
