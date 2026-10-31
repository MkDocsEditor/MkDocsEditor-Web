<script setup lang="ts">
import { mdiHome } from '@mdi/js'
import { computed } from 'vue'

import type { SectionModel } from '@/api'

const props = defineProps<{ ancestors: SectionModel[]; current?: string }>()

const items = computed(() => [
  ...props.ancestors.map((section, i) => ({
    title: i === 0 ? 'Wiki' : section.name,
    to: i === 0 ? { name: 'home' } : { name: 'section', params: { id: section.id } },
    disabled: false,
  })),
  ...(props.current ? [{ title: props.current, disabled: true }] : []),
])
</script>

<template>
  <v-breadcrumbs :items="items" density="compact" class="px-0 flex-wrap">
    <template #prepend>
      <v-icon :icon="mdiHome" size="small" class="me-1" />
    </template>
  </v-breadcrumbs>
</template>
