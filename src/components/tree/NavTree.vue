<script setup lang="ts">
import { mdiChevronDown, mdiChevronRight } from '@mdi/js'
import { computed } from 'vue'

import type { SectionModel } from '@/api'
import { iconFor } from '@/services/icons'
import { sortByName } from '@/stores/tree'

const props = defineProps<{
  section: SectionModel
  depth: number
  activeId?: string
  opened: Set<string>
}>()
const emit = defineEmits<{ toggle: [id: string]; navigate: [] }>()

const subsections = computed(() => sortByName(props.section.subsections))
const documents = computed(() => sortByName(props.section.documents))
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
        <v-icon :icon="iconFor(sub)" size="small" class="me-2" />
      </template>
    </v-list-item>
    <NavTree
      v-if="opened.has(sub.id)"
      :section="sub"
      :depth="depth + 1"
      :active-id="activeId"
      :opened="opened"
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
    @click="emit('navigate')"
  >
    <template #prepend>
      <span class="nav-tree__spacer" />
      <v-icon :icon="iconFor(doc)" size="small" class="me-2" />
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
</style>
