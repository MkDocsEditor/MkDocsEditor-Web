<script setup lang="ts">
/** The title of a part of a page or card, with its actions at the end of the row. */
const { level = 2 } = defineProps<{ title: string; level?: 2 | 3 }>()
</script>

<template>
  <div class="d-flex align-center ga-2 mb-2">
    <component :is="`h${level}`" class="text-title-medium flex-grow-1">{{ title }}</component>
    <slot />
  </div>
</template>
