<script setup lang="ts">
import { mdiArrowUp, mdiChevronRight, mdiLinkVariant, mdiMagnify } from '@mdi/js'
import { computed, ref } from 'vue'

import type { ItemType, SectionModel, TreeItem } from '@/api'
import ResourceThumb from '@/components/resources/ResourceThumb.vue'
import { colorFor, formatSize, iconFor } from '@/services/icons'
import { useTreeStore } from '@/stores/tree'
import { sortByName } from '@/stores/treeIndex'

/**
 * Browses the wiki folder by folder, or searches it, for the pickers and the move dialog.
 * Folders open on click; other items are picked. `v-model:section` is the open folder.
 */
const props = withDefaults(
  defineProps<{
    /** Item types to list besides folders. */
    types?: ItemType[]
    /** Further filter, for example images only. */
    filter?: (item: TreeItem) => boolean
    /** Folders can be picked too (a link to a folder), with a button next to them. */
    pickSections?: boolean
    /** Highlighted item. */
    selectedId?: string
    /** Items that cannot be picked or opened (a folder cannot move into itself). */
    disabledIds?: string[]
    searchPlaceholder?: string
  }>(),
  {
    types: () => ['document', 'resource'],
    filter: undefined,
    selectedId: undefined,
    disabledIds: () => [],
    searchPlaceholder: 'Search…',
  },
)
const sectionId = defineModel<string>('section', { required: true })
const emit = defineEmits<{ pick: [item: TreeItem] }>()

const tree = useTreeStore()
const query = ref('')

const current = computed<SectionModel | undefined>(
  () => tree.section(sectionId.value) ?? tree.root ?? undefined,
)
const ancestors = computed(() => (current.value ? tree.ancestors(current.value.id) : []))
const parent = computed(() => ancestors.value.at(-1))

function allowed(item: TreeItem): boolean {
  if (item.type !== 'section' && !props.types.includes(item.type)) return false
  return props.filter ? item.type === 'section' || props.filter(item) : true
}

const entries = computed<TreeItem[]>(() => {
  const section = current.value
  if (!section) return []
  return [
    ...sortByName(section.subsections),
    ...sortByName(section.documents),
    ...sortByName(section.resources),
  ].filter(allowed)
})

const hits = computed(() =>
  query.value.trim() === '' ? [] : tree.search(query.value).filter((hit) => allowed(hit.item)),
)

function isDisabled(item: TreeItem): boolean {
  return props.disabledIds?.includes(item.id) ?? false
}

function activate(item: TreeItem): void {
  if (isDisabled(item)) return
  if (item.type === 'section') {
    sectionId.value = item.id
    query.value = ''
  } else emit('pick', item)
}

/** A folder found by the search is picked when folders can be picked, else opened. */
function chooseHit(item: TreeItem): void {
  if (props.pickSections && item.type === 'section' && !isDisabled(item)) emit('pick', item)
  else activate(item)
}

function subtitle(item: TreeItem, path?: string[]): string {
  if (path) return path.join(' › ') || 'Wiki'
  if (item.type === 'resource') return formatSize(item.filesize)
  return ''
}

function crumbTitle(section: SectionModel): string {
  return section.id === tree.root?.id ? 'Wiki' : section.name
}
</script>

<template>
  <div class="tree-browser">
    <v-text-field
      v-model="query"
      :prepend-inner-icon="mdiMagnify"
      :placeholder="searchPlaceholder"
      variant="solo-filled"
      density="compact"
      flat
      clearable
      hide-details
      class="mb-2"
      data-testid="browser-search"
    />
    <template v-if="!query">
      <div class="tree-browser__crumbs d-flex align-center flex-wrap ga-1 mb-1">
        <v-btn
          :icon="mdiArrowUp"
          :disabled="!parent"
          variant="text"
          size="small"
          aria-label="Up one folder"
          data-testid="browser-up"
          @click="parent && (sectionId = parent.id)"
        />
        <template v-for="section in ancestors" :key="section.id">
          <a href="#" class="tree-browser__crumb" @click.prevent="sectionId = section.id">
            {{ crumbTitle(section) }}
          </a>
          <span class="text-medium-emphasis">›</span>
        </template>
        <strong v-if="current" data-testid="browser-current">{{ crumbTitle(current) }}</strong>
        <v-spacer />
        <v-btn
          v-if="pickSections && current"
          :prepend-icon="mdiLinkVariant"
          variant="text"
          size="small"
          data-testid="browser-pick-current"
          @click="emit('pick', current)"
        >
          This folder
        </v-btn>
      </div>
      <v-list density="compact" class="py-0" data-testid="browser-list">
        <v-list-item
          v-for="item in entries"
          :key="item.id"
          :title="item.name"
          :subtitle="subtitle(item)"
          :active="item.id === selectedId"
          :disabled="isDisabled(item)"
          :data-testid="`browser-${item.type}`"
          @click="activate(item)"
        >
          <template #prepend>
            <ResourceThumb
              v-if="item.type === 'resource'"
              :resource="item"
              :size="36"
              class="me-3"
            />
            <span v-else class="tree-browser__icon me-3">
              <v-icon :icon="iconFor(item)" :color="colorFor(item)" />
            </span>
          </template>
          <template v-if="item.type === 'section'" #append>
            <v-btn
              v-if="pickSections"
              :icon="mdiLinkVariant"
              variant="text"
              size="small"
              :aria-label="`Link to the folder ${item.name}`"
              @click.stop="emit('pick', item)"
            />
            <v-icon :icon="mdiChevronRight" size="small" />
          </template>
        </v-list-item>
        <v-list-item v-if="entries.length === 0" subtitle="Nothing here." />
      </v-list>
    </template>
    <v-list v-else density="compact" class="py-0" data-testid="browser-results">
      <v-list-item
        v-for="hit in hits"
        :key="hit.item.id"
        :title="hit.item.name"
        :subtitle="subtitle(hit.item, hit.path)"
        :disabled="isDisabled(hit.item)"
        :data-testid="`browser-hit-${hit.item.type}`"
        @click="chooseHit(hit.item)"
      >
        <template #prepend>
          <ResourceThumb
            v-if="hit.item.type === 'resource'"
            :resource="hit.item"
            :size="36"
            class="me-3"
          />
          <span v-else class="tree-browser__icon me-3">
            <v-icon :icon="iconFor(hit.item)" :color="colorFor(hit.item)" />
          </span>
        </template>
      </v-list-item>
      <v-list-item v-if="hits.length === 0" subtitle="Nothing found." />
    </v-list>
  </div>
</template>

<style scoped>
.tree-browser__crumb {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.tree-browser__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}
</style>
