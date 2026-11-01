<script setup lang="ts">
import { ref, watch } from 'vue'

import type { ResourceModel } from '@/api'
import { colorFor, iconFor } from '@/services/icons'
import { thumbnailUrl } from '@/services/thumbnails'

/** A square preview of a resource: the image, or the icon of its kind. */
const props = withDefaults(defineProps<{ resource: ResourceModel; size?: number }>(), {
  size: 40,
})

const url = ref<string | null>(null)
watch(
  () => [props.resource.id, props.resource.modtime] as const,
  () => {
    url.value = null
    const pending = thumbnailUrl(props.resource, props.size > 128 ? 512 : 256)
    const id = props.resource.id
    pending
      ?.then((u) => {
        if (props.resource.id === id) url.value = u
      })
      .catch(() => undefined)
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="resource-thumb"
    :style="{ width: `${size}px`, height: `${size}px` }"
    data-testid="resource-thumb"
  >
    <img v-if="url" :src="url" alt="" loading="lazy" />
    <v-icon
      v-else
      :icon="iconFor(resource)"
      :color="colorFor(resource)"
      :size="Math.round(size * 0.6)"
    />
  </div>
</template>

<style scoped>
.resource-thumb {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.resource-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
