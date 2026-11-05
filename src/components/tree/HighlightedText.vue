<script setup lang="ts">
import { computed } from 'vue'

import type { MatchRange } from '@/services/search'

const props = defineProps<{ text: string; matches: MatchRange[] }>()

const parts = computed(() => {
  const result: { text: string; match: boolean }[] = []
  let position = 0
  for (const [from, to] of props.matches) {
    if (from > position) result.push({ text: props.text.slice(position, from), match: false })
    result.push({ text: props.text.slice(from, to), match: true })
    position = to
  }
  if (position < props.text.length) result.push({ text: props.text.slice(position), match: false })
  return result
})
</script>

<template>
  <span
    ><template v-for="(part, i) in parts" :key="i"
      ><mark v-if="part.match" class="highlighted-text">{{ part.text }}</mark
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>

<style scoped>
.highlighted-text {
  background: rgb(var(--v-theme-primary-container));
  color: rgb(var(--v-theme-on-primary-container));
  font-weight: 600;
  border-radius: var(--md-sys-shape-corner-extra-small);
}
</style>
