<script setup lang="ts">
/**
 * A dialog in one of three widths: `small` asks one thing, `medium` holds a list or a form, `large`
 * holds two panes. The wider ones fill the screen of a phone. Other props go to `v-dialog`.
 */
const { size = 'small' } = defineProps<{ size?: 'small' | 'medium' | 'large' }>()
const open = defineModel<boolean>({ required: true })

const WIDTHS = { small: 440, medium: 640, large: 1100 }
</script>

<template>
  <v-dialog
    v-model="open"
    :max-width="WIDTHS[size]"
    :fullscreen="size !== 'small' && $vuetify.display.xs"
  >
    <slot />
  </v-dialog>
</template>
