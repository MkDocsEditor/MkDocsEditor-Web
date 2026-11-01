<script setup lang="ts">
import { mdiFileDocumentOutline, mdiRefresh } from '@mdi/js'
import { computed, ref, watch } from 'vue'

import { ApiError, useApi } from '@/api'
import type { Backlink, ItemType } from '@/api'

import { groupBySource, linesLabel } from './backlinks'

/**
 * The pages that link to an item ("used by", from the backend's reference index). A click
 * opens the page at the line of the link.
 */
const props = defineProps<{
  type: ItemType
  id: string
  /** For folders: hide links from pages inside the folder. */
  externalOnly?: boolean
  /** Changes of this value reload the list (for example the tree's version). */
  reloadKey?: unknown
}>()

const backlinks = ref<Backlink[] | null>(null)
const failure = ref('')
const loading = ref(false)
let generation = 0

async function load(): Promise<void> {
  const mine = ++generation
  loading.value = true
  failure.value = ''
  try {
    const all = await useApi().getBacklinks(props.type, props.id)
    if (mine !== generation) return
    backlinks.value = props.externalOnly ? all.filter((l) => !l.internal) : all
  } catch (error) {
    if (mine !== generation) return
    backlinks.value = null
    failure.value =
      error instanceof ApiError && error.status === 404 && error.code !== 'not-found'
        ? 'This server does not track links yet.'
        : 'The links could not be loaded.'
  } finally {
    if (mine === generation) loading.value = false
  }
}

watch(() => [props.type, props.id, props.reloadKey], load, { immediate: true })

const groups = computed(() => groupBySource(backlinks.value ?? []))
</script>

<template>
  <div data-testid="backlinks">
    <v-progress-linear v-if="loading" indeterminate color="primary" height="2" />
    <v-list density="compact" class="py-0">
      <v-list-item
        v-for="group in groups"
        :key="group.source.id"
        :title="group.source.name"
        :subtitle="`${group.source.path} · ${linesLabel(group.links)}`"
        :prepend-icon="mdiFileDocumentOutline"
        :to="{
          name: 'document',
          params: { id: group.source.id },
          query: { line: String(group.links[0]!.line) },
        }"
        data-testid="backlink"
      />
      <v-list-item
        v-if="backlinks && groups.length === 0"
        subtitle="No page links here."
        class="text-medium-emphasis"
        data-testid="backlinks-empty"
      />
      <v-list-item v-if="failure" :subtitle="failure" class="text-medium-emphasis">
        <template #append>
          <v-btn
            :icon="mdiRefresh"
            variant="text"
            size="small"
            aria-label="Try again"
            @click="load"
          />
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>
