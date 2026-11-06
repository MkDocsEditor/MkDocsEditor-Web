<script setup lang="ts">
import { mdiDelete, mdiFolderMoveOutline, mdiPencil } from '@mdi/js'

import type { TreeItem } from '@/api'
import { useItemActionsStore } from '@/stores/itemActions'
import { useMoveStore } from '@/stores/move'

/** Rename, move and delete of an item, as entries of a menu. */
defineProps<{ item: TreeItem }>()

const move = useMoveStore()
const actions = useItemActionsStore()
</script>

<template>
  <v-list-item
    :prepend-icon="mdiPencil"
    title="Rename…"
    data-testid="item-rename"
    @click="move.rename(item)"
  />
  <v-list-item
    :prepend-icon="mdiFolderMoveOutline"
    title="Move to…"
    data-testid="item-move"
    @click="move.open(item)"
  />
  <v-list-item
    :prepend-icon="mdiDelete"
    title="Delete…"
    base-color="error"
    data-testid="item-delete"
    @click="actions.remove(item)"
  />
</template>
