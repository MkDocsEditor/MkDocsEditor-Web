<script setup lang="ts">
defineProps<{ title: string; text: string; confirmText?: string; danger?: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [] }>()

function confirm(): void {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="440">
    <v-card :title="title" :text="text">
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
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
  </v-dialog>
</template>
