<script setup lang="ts">
import { ref, watch } from 'vue'

import { validateName } from '@/services/names'

const props = defineProps<{
  title: string
  label: string
  initial?: string
  confirmText?: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [name: string] }>()

const name = ref('')
watch(
  open,
  (isOpen) => {
    if (isOpen) name.value = props.initial ?? ''
  },
  { immediate: true },
)

function submit(): void {
  if (validateName(name.value) !== true) return
  emit('confirm', name.value.trim())
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="440">
    <v-card :title="title">
      <v-form @submit.prevent="submit">
        <v-card-text>
          <v-text-field
            v-model="name"
            :label="label"
            :rules="[validateName]"
            autofocus
            data-testid="name-input"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="open = false">Abbrechen</v-btn>
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            :disabled="validateName(name) !== true"
            data-testid="name-confirm"
          >
            {{ confirmText ?? 'Speichern' }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
