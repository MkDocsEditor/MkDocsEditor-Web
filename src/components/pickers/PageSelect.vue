<script setup lang="ts">
import { computed } from 'vue'

import type { DocumentModel } from '@/api'
import { usePageMetaStore } from '@/stores/pageMeta'
import { useTreeStore } from '@/stores/tree'

/** A field to choose one page of the wiki by its title or path. */
defineProps<{ label?: string; testid?: string }>()
const model = defineModel<string | null>({ default: null })

const tree = useTreeStore()
const pageMeta = usePageMetaStore()

const pages = computed(() =>
  [...tree.index.items.values()]
    .filter((item): item is DocumentModel => item.type === 'document')
    .map((page) => ({ id: page.id, title: pageMeta.title(page), path: tree.path(page.id) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true })),
)

type Page = { title: string; path: string }

/** Every word of the query in the title or the path. */
function matches(_value: string, query: string, item?: { raw?: Page } | Page) {
  const page = (item && 'raw' in item ? item.raw : item) as Page | undefined
  const text = `${page?.title ?? ''} ${page?.path ?? ''}`.toLocaleLowerCase()
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}
</script>

<template>
  <v-autocomplete
    v-model="model"
    :items="pages"
    item-title="title"
    item-value="id"
    :label="label ?? 'Page'"
    :custom-filter="matches"
    auto-select-first
    :data-testid="testid"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps" :subtitle="item.path" />
    </template>
  </v-autocomplete>
</template>
