<script setup lang="ts">
import { computed } from 'vue'

import AppDialog from '@/components/common/AppDialog.vue'
import { instanceColor, setInstanceColor } from '@/sync/instance'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ accountColor?: string }>()

const color = computed({
  get: () => instanceColor.value ?? props.accountColor ?? '#000000',
  set: (value: string) => setInstanceColor(value.slice(0, 7).toLowerCase()),
})
</script>

<template>
  <AppDialog v-model="open">
    <v-card title="My cursor color" data-testid="cursor-color-dialog">
      <v-card-text>
        <p class="text-body-medium mb-4">
          How others see your cursor from this tab, until you close it. The color of your account
          stays as it is.
        </p>
        <v-color-picker
          v-model="color"
          mode="hex"
          :modes="['hex']"
          elevation="0"
          width="100%"
          show-swatches
        />
      </v-card-text>
      <v-card-actions>
        <v-btn
          :disabled="!instanceColor"
          data-testid="cursor-color-reset"
          @click="setInstanceColor(null)"
        >
          Use my account color
        </v-btn>
        <v-spacer />
        <v-btn data-testid="cursor-color-close" @click="open = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </AppDialog>
</template>
