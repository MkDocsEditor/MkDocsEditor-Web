<script setup lang="ts">
import AppDialog from '@/components/common/AppDialog.vue'
defineProps<{ title: string; text: string; confirmText?: string; danger?: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [] }>()

function confirm(): void {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <AppDialog v-model="open">
    <v-card :title="title" :text="text">
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn
          :color="danger ? 'error' : 'primary'"
          variant="flat"
          data-testid="confirm-button"
          @click="confirm"
        >
          {{ confirmText ?? 'OK' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </AppDialog>
</template>
