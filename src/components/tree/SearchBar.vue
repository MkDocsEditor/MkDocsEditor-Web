<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

import { shortcutLabel } from '@/editor/formatting'

defineEmits<{ open: [] }>()

// Material's window sizes: a search bar from medium up, an icon on a phone
const { mdAndUp } = useDisplay()
const shortcut = computed(() => shortcutLabel('Mod-k'))
</script>

<template>
  <button
    v-if="mdAndUp"
    type="button"
    class="search-bar text-body-large"
    aria-label="Search"
    data-testid="search-button"
    @click="$emit('open')"
  >
    <v-icon :icon="mdiMagnify" />
    <span class="search-bar__hint text-truncate">Search pages, folders and files…</span>
    <kbd class="search-bar__shortcut text-label-large">{{ shortcut }}</kbd>
  </button>
  <v-btn
    v-else
    :icon="mdiMagnify"
    aria-label="Search"
    data-testid="search-button"
    @click="$emit('open')"
  />
</template>

<style scoped>
/* Centred, so the docked search view of SearchDialog opens exactly on top of it. */
.search-bar {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  width: var(--app-search-width);
  height: var(--app-search-height);
  padding: 0 var(--app-space-4);
  border: none;
  border-radius: var(--md-sys-shape-corner-full);
  background: rgb(var(--v-theme-surface-light));
  color: rgb(var(--v-theme-on-surface-variant));
  cursor: text;
  transition: box-shadow var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.search-bar:hover {
  box-shadow: 0 1px 3px 1px rgb(0 0 0 / 0.15);
}
.search-bar:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.search-bar__hint {
  flex: 1;
  text-align: start;
}
.search-bar__shortcut {
  font-family: inherit;
}
</style>
