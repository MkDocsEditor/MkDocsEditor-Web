<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import type { SearchHit } from '@/stores/treeIndex'
import { colorFor, iconFor } from '@/services/icons'
import { useTreeStore } from '@/stores/tree'

const open = defineModel<boolean>({ required: true })
const tree = useTreeStore()
const router = useRouter()

const query = ref('')
const hits = computed(() => tree.search(query.value))
watch(open, (isOpen) => {
  if (isOpen) query.value = ''
})

async function choose(hit: SearchHit): Promise<void> {
  open.value = false
  if (hit.item.type === 'section')
    await router.push({ name: 'section', params: { id: hit.item.id } })
  else if (hit.item.type === 'document')
    await router.push({ name: 'document', params: { id: hit.item.id } })
  else await router.push({ name: 'resource', params: { id: hit.item.id } })
}

function chooseFirst(): void {
  const first = hits.value[0]
  if (first) void choose(first)
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" :fullscreen="$vuetify.display.xs" scrollable>
    <v-card>
      <v-card-text class="pb-0">
        <v-text-field
          v-model="query"
          :prepend-inner-icon="mdiMagnify"
          placeholder="Search pages, folders and files…"
          variant="solo-filled"
          flat
          autofocus
          clearable
          hide-details
          data-testid="search-input"
          @keydown.enter="chooseFirst"
        />
      </v-card-text>
      <v-card-text class="px-2">
        <v-list v-if="hits.length > 0" density="comfortable">
          <v-list-item
            v-for="hit in hits"
            :key="hit.item.id"
            :title="hit.item.name"
            :subtitle="hit.path.join(' › ')"
            @click="choose(hit)"
          >
            <template #prepend>
              <v-icon :icon="iconFor(hit.item)" :color="colorFor(hit.item)" />
            </template>
          </v-list-item>
        </v-list>
        <p v-else-if="query" class="text-medium-emphasis pa-4">Nothing found.</p>
      </v-card-text>
      <v-card-actions v-if="$vuetify.display.xs">
        <v-spacer />
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
