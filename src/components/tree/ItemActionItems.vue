<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiDelete,
  mdiFolderMoveOutline,
  mdiPencil,
  mdiPin,
  mdiPinOff,
} from '@mdi/js'

import type { TreeItem } from '@/api'
import { useItemActionsStore } from '@/stores/itemActions'
import { useMoveStore } from '@/stores/move'
import { usePinsStore } from '@/stores/pins'

/** Pin (pages only), rename, move and delete of an item, as entries of a menu. */
defineProps<{ item: TreeItem }>()

const move = useMoveStore()
const actions = useItemActionsStore()
const pins = usePinsStore()
pins.ensureLoaded()
</script>

<template>
  <template v-if="item.type === 'document' && pins.available">
    <v-list-item
      :prepend-icon="pins.isPinned('personal', item.id) ? mdiPinOff : mdiPin"
      :title="pins.isPinned('personal', item.id) ? 'Unpin for me' : 'Pin for me'"
      data-testid="item-pin-personal"
      @click="pins.setPinned('personal', item.id, !pins.isPinned('personal', item.id))"
    />
    <v-list-item
      v-if="pins.canPinForEveryone"
      :prepend-icon="pins.isPinned('family', item.id) ? mdiPinOff : mdiAccountGroupOutline"
      :title="pins.isPinned('family', item.id) ? 'Unpin for everyone' : 'Pin for everyone'"
      data-testid="item-pin-family"
      @click="pins.setPinned('family', item.id, !pins.isPinned('family', item.id))"
    />
    <v-divider />
  </template>
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
