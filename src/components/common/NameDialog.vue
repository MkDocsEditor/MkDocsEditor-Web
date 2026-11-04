<script setup lang="ts">
import { ref, watch } from 'vue'

import { ApiError } from '@/api'
import { validateName } from '@/services/names'
import { describeError } from '@/stores/notify'

const props = defineProps<{
  title: string
  label: string
  initial?: string
  confirmText?: string
  /** Does the work; the dialog stays open and shows why if it fails. */
  save: (name: string) => Promise<void>
}>()
const open = defineModel<boolean>({ required: true })

const name = ref('')
const busy = ref(false)
const error = ref('')
watch(
  open,
  (isOpen) => {
    if (isOpen) {
      name.value = props.initial ?? ''
      error.value = ''
    }
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (busy.value || validateName(name.value) !== true) return
  busy.value = true
  error.value = ''
  try {
    await props.save(name.value.trim())
    open.value = false
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 409 ? 'This name already exists.' : describeError(e)
  } finally {
    busy.value = false
  }
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
            :error-messages="error"
            autofocus
            data-testid="name-input"
            @update:model-value="error = ''"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="open = false">Cancel</v-btn>
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            :disabled="validateName(name) !== true"
            :loading="busy"
            data-testid="name-confirm"
          >
            {{ confirmText ?? 'Save' }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
