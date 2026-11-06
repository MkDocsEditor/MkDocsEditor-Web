<script setup lang="ts">
import { mdiDotsVertical } from '@mdi/js'

import type { TreeItem } from '@/api'

import ItemActionItems from './ItemActionItems.vue'

/** A ⋮ button with the actions of an item; more entries can come first through the slot. */
withDefaults(defineProps<{ item: TreeItem; size?: string }>(), { size: 'small' })
// a class goes to the button: the menu itself has no element of its own
defineOptions({ inheritAttrs: false })
</script>

<template>
  <v-menu>
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="{ ...menuProps, ...$attrs }"
        :icon="mdiDotsVertical"
        :size="size"
        :aria-label="`Actions for ${item.name}`"
        data-testid="item-actions"
        @click.stop.prevent
      />
    </template>
    <v-list>
      <slot />
      <ItemActionItems :item="item" />
    </v-list>
  </v-menu>
</template>
