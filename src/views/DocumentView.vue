<script setup lang="ts">
import { mdiOpenInNew } from '@mdi/js'
import { computed, ref, watch } from 'vue'

import { useApi } from '@/api'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import { describeError } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { wikiPageUrl } from '@/services/wiki'

const props = defineProps<{ id: string }>()

const tree = useTreeStore()
const document = computed(() => tree.document(props.id))
const ancestors = computed(() => tree.ancestors(props.id))
const wikiUrl = computed(() => (document.value ? wikiPageUrl(document.value.url) : null))

const content = ref<string | null>(null)
const error = ref('')

watch(
  () => props.id,
  async (id) => {
    content.value = null
    error.value = ''
    try {
      content.value = await useApi().getDocumentContent(id)
    } catch (e) {
      error.value = describeError(e)
    }
  },
  { immediate: true },
)
</script>

<template>
  <v-container max-width="960">
    <ItemBreadcrumbs :ancestors="ancestors" :current="document?.name" />
    <div class="d-flex align-center ga-2 mb-2">
      <h1 class="text-h5 flex-grow-1" data-testid="document-title">{{ document?.name }}</h1>
      <v-btn
        v-if="wikiUrl"
        :href="wikiUrl"
        target="_blank"
        rel="noopener"
        variant="tonal"
        :append-icon="mdiOpenInNew"
      >
        Im Wiki ansehen
      </v-btn>
    </div>
    <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
    <v-skeleton-loader v-else-if="content === null" type="paragraph@3" />
    <pre v-else class="document-view__content" data-testid="document-content">{{ content }}</pre>
  </v-container>
</template>

<style scoped>
.document-view__content {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, monospace;
  font-size: 0.9rem;
}
</style>
