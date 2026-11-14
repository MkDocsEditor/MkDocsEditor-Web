<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { EXPIRY_FIELD_CHOICES, expiryTime, localDay } from '@/services/appTokens'
import type { ExpiryChoice } from '@/services/appTokens'

/**
 * When a token ends: no fixed end, in some days, or on a date. The model is the end as RFC 3339,
 * null without one, and undefined while a chosen date is missing or past.
 */
const props = withDefaults(
  defineProps<{ initial?: ExpiryChoice; initialDate?: string; testid?: string }>(),
  { initial: 'none', initialDate: '', testid: 'expiry' },
)
const model = defineModel<string | null | undefined>()

const choice = ref<ExpiryChoice>(props.initial)
const date = ref(props.initialDate)
const today = localDay(Date.now())

const dateError = computed(() =>
  choice.value === 'date' && expiryTime('date', date.value) === undefined
    ? 'Choose a day after today'
    : '',
)

watch(
  [choice, date],
  () => {
    model.value = expiryTime(choice.value, date.value)
  },
  { immediate: true },
)
</script>

<template>
  <div class="d-flex flex-column ga-2">
    <v-select
      v-model="choice"
      :items="EXPIRY_FIELD_CHOICES"
      label="Expires"
      hide-details
      :data-testid="testid"
    />
    <v-text-field
      v-if="choice === 'date'"
      v-model="date"
      type="date"
      label="Last day"
      :min="today"
      :error-messages="dateError"
      :data-testid="`${testid}-date`"
    />
  </div>
</template>
