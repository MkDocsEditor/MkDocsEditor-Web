<script setup lang="ts">
import { mdiChevronDown, mdiChevronRight } from '@mdi/js'
import { computed } from 'vue'

import type { SectionModel } from '@/api'
import { colorFor, iconFor } from '@/services/icons'
import { sortByName } from '@/stores/tree'

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
</script>

<template>
  <template v-for="sub in subsections" :key="sub.id">
    <v-list-item
      :to="{ name: 'section', params: { id: sub.id } }"
      :active="sub.id === activeId"
      :style="indent"
      density="compact"
      :title="sub.name"
      data-testid="tree-section"
      @click="emit('navigate')"
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
    data-testid="tree-document"
    @click="emit('navigate')"
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
    data-testid="tree-resource"
    @click="emit('navigate')"
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
/* Files are secondary in the tree: smaller and quieter than pages. */
.nav-tree__file :deep(.v-list-item-title) {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
</style>
