<script setup lang="ts">
import { mdiFileDocumentOutline, mdiLinkVariantOff, mdiRefresh } from '@mdi/js'
import { computed, ref, watch } from 'vue'

import { ApiError, useApi } from '@/api'
import type { BrokenReference, ResourceModel } from '@/api'
import ResourceThumb from '@/components/resources/ResourceThumb.vue'
import { formatSize } from '@/services/icons'
import { groupBySource } from '@/components/references/backlinks'
import { useTreeStore } from '@/stores/tree'

/**
 * Link maintenance for the whole wiki: broken links (with the fix when the target moved) and
 * files that nothing uses, from the backend's reference index.
 */
const props = defineProps<{ tab?: 'broken' | 'unused' }>()

const tree = useTreeStore()
const tab = ref<'broken' | 'unused'>(props.tab ?? 'broken')
watch(
  () => props.tab,
  (next) => (tab.value = next ?? 'broken'),
)

const broken = ref<BrokenReference[] | null>(null)
const unused = ref<ResourceModel[] | null>(null)
const failure = ref('')
const loading = ref(false)

/** Every tree change reloads the lists; only the answer to the latest request counts. */
let generation = 0

async function load(): Promise<void> {
  const mine = ++generation
  loading.value = true
  failure.value = ''
  try {
    const api = useApi()
    const [b, u] = await Promise.all([api.getBrokenReferences(), api.getUnusedResources()])
    if (mine !== generation) return
    broken.value = b
    unused.value = u
  } catch (error) {
    if (mine !== generation) return
    failure.value =
      error instanceof ApiError && error.status === 404
        ? 'This server does not track links yet. Update the backend.'
        : 'The links could not be loaded.'
  } finally {
    if (mine === generation) loading.value = false
  }
}
watch(() => tree.root, load, { immediate: true })

const groups = computed(() => groupBySource(broken.value ?? []))

function explain(ref: BrokenReference): string {
  const where = `Line ${ref.line}`
  if (ref.movedTo)
    return `${where} · moved to ${ref.movedTo.path}${
      ref.suggestedDestination ? `, use ${ref.suggestedDestination}` : ''
    }`
  if (ref.reason === 'outside-docs') return `${where} · points outside the wiki`
  return `${where} · ${ref.path ? `${ref.path} does not exist` : 'not found'}`
}

/** Resources keep their tree path; older answers may lack it. */
function resourcePath(resource: ResourceModel): string {
  return resource.path ?? tree.path(resource.id)
}
</script>

<template>
  <v-container max-width="960" class="pb-16">
    <div class="d-flex align-center mb-2">
      <h1 class="text-h5 flex-grow-1">Links and files</h1>
      <v-btn
        :icon="mdiRefresh"
        variant="text"
        :loading="loading"
        aria-label="Reload"
        data-testid="references-reload"
        @click="load"
      />
    </div>
    <v-tabs v-model="tab" class="mb-3">
      <v-tab value="broken" data-testid="tab-broken">
        Broken links
        <v-chip v-if="broken" size="x-small" class="ms-2">{{ broken.length }}</v-chip>
      </v-tab>
      <v-tab value="unused" data-testid="tab-unused">
        Unused files
        <v-chip v-if="unused" size="x-small" class="ms-2">{{ unused.length }}</v-chip>
      </v-tab>
    </v-tabs>

    <v-alert v-if="failure" type="warning" variant="tonal" :text="failure" class="mb-3" />

    <template v-if="tab === 'broken'">
      <v-empty-state
        v-if="broken && broken.length === 0"
        :icon="mdiLinkVariantOff"
        title="No broken links"
        text="Every link and image in the wiki points to something that exists."
      />
      <v-list v-else-if="broken" lines="two" class="rounded-lg" border>
        <template v-for="group in groups" :key="group.source.id">
          <v-list-subheader>
            <v-icon :icon="mdiFileDocumentOutline" size="small" class="me-1" />
            {{ group.source.path }}
          </v-list-subheader>
          <v-list-item
            v-for="item in group.links"
            :key="`${item.line}:${item.column}`"
            :title="item.destination"
            :subtitle="explain(item)"
            :to="{
              name: 'document',
              params: { id: group.source.id },
              query: { line: String(item.line) },
            }"
            data-testid="broken-link"
          />
        </template>
      </v-list>
    </template>

    <template v-else>
      <p class="text-body-2 text-medium-emphasis mb-3">
        No page links to these files and <code>mkdocs.yml</code> does not name them. Templates of
        the theme, snippets and links from outside the wiki are not seen, so check before deleting.
      </p>
      <v-empty-state
        v-if="unused && unused.length === 0"
        title="No unused files"
        text="Every file is used by a page or by mkdocs.yml."
      />
      <v-list v-else-if="unused" class="rounded-lg" border>
        <v-list-item
          v-for="resource in unused"
          :key="resource.id"
          :title="resource.name"
          :subtitle="`${resourcePath(resource)} · ${formatSize(resource.filesize)}`"
          :to="{ name: 'resource', params: { id: resource.id } }"
          data-testid="unused-file"
        >
          <template #prepend>
            <ResourceThumb :resource="resource" :size="36" class="me-4" />
          </template>
        </v-list-item>
      </v-list>
    </template>
  </v-container>
</template>
