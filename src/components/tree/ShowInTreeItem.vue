<script setup lang="ts">
import { mdiFileTreeOutline } from '@mdi/js'

import { SHOW_IN_TREE_KEY, showInTree } from '@/composables/showInTree'
import { shortcutLabel } from '@/editor/formatting'

/** "Show in tree" as an entry of a menu, with its shortcut. */
defineProps<{ id: string }>()
const shortcut = shortcutLabel(SHOW_IN_TREE_KEY)
</script>

<template>
  <v-list-item
    :prepend-icon="mdiFileTreeOutline"
    title="Show in tree"
    data-testid="show-in-tree"
    @click="showInTree(id)"
  >
    <template #append>
      <kbd class="show-in-tree__key text-medium-emphasis ms-4">{{ shortcut }}</kbd>
    </template>
  </v-list-item>
</template>

<style scoped>
.show-in-tree__key {
  font-family: inherit;
  font-size: var(--md-sys-typescale-label-medium-size);
}
</style>
