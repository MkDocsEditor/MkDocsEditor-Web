<script setup lang="ts">
import { mdiEye, mdiEyeOff, mdiLock } from '@mdi/js'
import { ref } from 'vue'

withDefaults(
  defineProps<{
    label?: string
    autocomplete?: 'current-password' | 'new-password'
    name?: string
    rules?: ((value: string) => true | string)[]
    disabled?: boolean
    autofocus?: boolean
    hint?: string
  }>(),
  {
    label: 'Password',
    autocomplete: 'current-password',
    name: 'password',
    rules: () => [],
    hint: '',
  },
)
const model = defineModel<string>({ required: true })
const show = ref(false)
</script>

<template>
  <v-text-field
    v-model="model"
    :label="label"
    :name="name"
    :autocomplete="autocomplete"
    :type="show ? 'text' : 'password'"
    :prepend-inner-icon="mdiLock"
    :rules="rules"
    :disabled="disabled"
    :autofocus="autofocus"
    :hint="hint"
    :persistent-hint="!!hint"
    autocapitalize="none"
    spellcheck="false"
  >
    <template #append-inner>
      <v-icon
        :icon="show ? mdiEyeOff : mdiEye"
        role="button"
        tabindex="0"
        :aria-label="show ? 'Hide password' : 'Show password'"
        @click="show = !show"
        @keydown.enter.prevent="show = !show"
        @keydown.space.prevent="show = !show"
      />
    </template>
  </v-text-field>
</template>
