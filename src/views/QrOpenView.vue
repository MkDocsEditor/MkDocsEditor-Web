<script setup lang="ts">
import { mdiFileDocumentOutline, mdiQrcode } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, useApi } from '@/api'
import type { QrConflict, QrGone } from '@/api'
import LoadError from '@/components/common/LoadError.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageSelect from '@/components/pickers/PageSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/services/time'

/**
 * Where a QR code sticker leads (`/q/<key>`): the page with the key opens right away. Otherwise
 * this says why not, and editors can put the key on a page.
 */
const props = defineProps<{ code: string }>()

const router = useRouter()
const auth = useAuthStore()
const canEdit = computed(() => auth.role === 'admin' || auth.role === 'editor')

type State =
  | { kind: 'loading' }
  | { kind: 'conflict'; conflict: QrConflict }
  | { kind: 'gone'; gone: QrGone }
  | { kind: 'unknown' }
  | { kind: 'error'; error: unknown }
const state = ref<State>({ kind: 'loading' })
const page = ref<string | null>(null)

async function open(): Promise<void> {
  state.value = { kind: 'loading' }
  try {
    const code = await useApi().getQrCode(props.code, true)
    await router.replace({ name: 'document', params: { id: code.item.id } })
  } catch (error) {
    if (!(error instanceof ApiError)) state.value = { kind: 'error', error }
    else if (error.code === 'qr-conflict')
      state.value = { kind: 'conflict', conflict: error.details as unknown as QrConflict }
    else if (error.code === 'qr-gone')
      state.value = { kind: 'gone', gone: error.details as unknown as QrGone }
    else if (error.status === 404) state.value = { kind: 'unknown' }
    else state.value = { kind: 'error', error }
  }
}
watch(() => props.code, open, { immediate: true })

/** The page opens with the dialog that adds the key to it. */
function assign(): void {
  if (page.value)
    void router.push({ name: 'document', params: { id: page.value }, query: { qr: props.code } })
}
</script>

<template>
  <v-container class="qr-open-view">
    <v-progress-linear
      v-if="state.kind === 'loading'"
      indeterminate
      aria-label="Opening the page of the code"
    />
    <LoadError
      v-else-if="state.kind === 'error'"
      title="The code could not be opened"
      :error="state.error"
      @retry="open"
    />
    <template v-else>
      <PageHeader :title="`QR code “${code}”`" testid="qr-open-title">
        <template #icon><v-icon :icon="mdiQrcode" /></template>
      </PageHeader>

      <template v-if="state.kind === 'conflict'">
        <p class="text-body-large mb-4" data-testid="qr-open-message">
          More than one page has this code. Open one of them, and remove the code from the others.
        </p>
        <v-list class="app-card-list py-0" data-testid="qr-open-pages">
          <v-list-item
            v-for="choice in state.conflict.items"
            :key="choice.item.id"
            :prepend-icon="mdiFileDocumentOutline"
            :title="choice.title"
            :subtitle="choice.item.path"
            :to="{ name: 'document', params: { id: choice.item.id } }"
          />
        </v-list>
      </template>

      <template v-else>
        <p class="text-body-large mb-2" data-testid="qr-open-message">
          <template v-if="state.kind === 'gone'">
            No page has this code any more. It was on “{{ state.gone.lastPath }}”{{
              state.gone.label ? `, labelled “${state.gone.label}”` : ''
            }}.
          </template>
          <template v-else>No page has this code yet.</template>
        </p>
        <p
          v-if="state.kind === 'gone' && state.gone.lastScannedAt"
          class="text-body-medium text-medium-emphasis mb-4"
        >
          Scanned last on {{ formatDate(state.gone.lastScannedAt) }}.
        </p>
        <template v-if="canEdit">
          <p class="text-body-medium mb-2">Put the code on a page, so the sticker opens it:</p>
          <div class="d-flex flex-wrap align-start ga-2 qr-open-view__assign">
            <PageSelect v-model="page" class="flex-grow-1" testid="qr-open-page" />
            <v-btn color="primary" :disabled="!page" data-testid="qr-open-assign" @click="assign">
              Put it there
            </v-btn>
          </div>
        </template>
        <p v-else class="text-body-medium text-medium-emphasis">
          Ask an editor of the wiki to put the code on a page.
        </p>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.qr-open-view {
  max-width: 720px;
}
.qr-open-view__assign {
  max-width: 560px;
}
</style>
