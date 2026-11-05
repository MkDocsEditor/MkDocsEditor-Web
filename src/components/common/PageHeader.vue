<script setup lang="ts">
/** The title of a page, with its actions at the end of the row. */
defineProps<{ title?: string; testid?: string }>()
</script>

<template>
  <header class="mb-4">
    <div class="d-flex align-center ga-2">
      <slot name="icon" />
      <h1 class="text-headline-small text-truncate flex-grow-1" :data-testid="testid">
        {{ title }}
      </h1>
      <slot name="actions" />
    </div>
    <slot />
  </header>
</template>
