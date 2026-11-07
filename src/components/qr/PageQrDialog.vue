<script setup lang="ts">
import { mdiContentCopy, mdiDelete, mdiPrinter } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import type { QrKey } from '@/api'
import QrCode from '@/components/auth/QrCode.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import { normalizeQrKey, qrKeysOf, suggestQrKey } from '@/markdown/qrKeys'
import { copyText } from '@/services/clipboard'
import { useNotifyStore } from '@/stores/notify'
import { useQrStore } from '@/stores/qr'

/**
 * The QR codes of a page: their stickers, and adding or removing codes. The codes live in the
 * front matter (`qr:`); a change goes into the text like typing does.
 */
const props = defineProps<{
  documentId: string
  /** The name of the page, for the suggested key. */
  name: string
  text: string
  readOnly: boolean
  /** A key to put on the page, from a sticker without a page. */
  suggested?: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ change: [keys: QrKey[]] }>()

const qr = useQrStore()
const notify = useNotifyStore()
const router = useRouter()

const keys = computed(() => qrKeysOf(props.text))
const key = ref('')
const label = ref('')

watch(open, (shown) => {
  if (!shown) return
  qr.ensureLoaded()
  key.value = props.suggested ?? (keys.value.length === 0 ? suggestQrKey(props.name) : '')
  label.value = ''
})

const normalized = computed(() => normalizeQrKey(key.value))
const elsewhere = computed(() =>
  normalized.value ? qr.otherPagesWith(normalized.value, props.documentId) : [],
)
const keyError = computed(() => {
  if (!key.value.trim()) return ''
  if (!normalized.value) return 'Use lower-case letters, digits and dashes, up to 64.'
  if (keys.value.some((k) => k.key === normalized.value)) return 'The page has this code already.'
  if (elsewhere.value.length > 0)
    return `“${elsewhere.value[0]!.title}” has this code. Remove it there first.`
  return ''
})

function add(): void {
  if (!normalized.value || keyError.value) return
  emit('change', [...keys.value, { key: normalized.value, label: label.value.trim() || null }])
  key.value = ''
  label.value = ''
}

function remove(code: QrKey): void {
  emit(
    'change',
    keys.value.filter((k) => k.key !== code.key),
  )
}

async function copy(code: QrKey): Promise<void> {
  if (await copyText(qr.urlFor(code.key))) notify.success('Link copied')
}

function print(): void {
  open.value = false
  void router.push({ name: 'qr-print', query: { key: keys.value.map((k) => k.key) } })
}
</script>

<template>
  <AppDialog v-model="open" size="medium">
    <v-card title="QR codes" data-testid="page-qr-dialog">
      <v-card-text>
        <p class="text-body-medium text-medium-emphasis mb-4">
          A sticker with one of these codes opens this page, also after it is renamed or moved.
        </p>
        <v-list v-if="keys.length > 0" class="py-0 mb-4" data-testid="page-qr-codes">
          <v-list-item v-for="code in keys" :key="code.key" data-testid="page-qr-code">
            <template #prepend>
              <QrCode
                :value="qr.urlFor(code.key)"
                :label="`QR code ${code.key}`"
                :size="96"
                class="me-4"
              />
            </template>
            <v-list-item-title
              ><code>{{ code.key }}</code></v-list-item-title
            >
            <v-list-item-subtitle v-if="code.label">{{ code.label }}</v-list-item-subtitle>
            <template #append>
              <v-btn
                :icon="mdiContentCopy"
                variant="text"
                :aria-label="`Copy the link of ${code.key}`"
                @click="copy(code)"
              />
              <v-btn
                v-if="!readOnly"
                :icon="mdiDelete"
                variant="text"
                :aria-label="`Remove ${code.key}`"
                data-testid="page-qr-remove"
                @click="remove(code)"
              />
            </template>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-medium mb-4">This page has no QR code yet.</p>

        <v-form v-if="!readOnly" class="d-flex flex-wrap ga-2" @submit.prevent="add">
          <v-text-field
            v-model="key"
            label="Code"
            :error-messages="keyError"
            hint="Lower-case letters, digits and dashes"
            class="page-qr-dialog__field"
            data-testid="page-qr-key"
          />
          <v-text-field
            v-model="label"
            label="Where the sticker is (optional)"
            class="page-qr-dialog__field"
            data-testid="page-qr-label"
          />
          <v-btn
            type="submit"
            color="primary"
            :disabled="!normalized || !!keyError"
            data-testid="page-qr-add"
          >
            Add code
          </v-btn>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn :to="{ name: 'qr-codes' }" @click="open = false">All QR codes</v-btn>
        <v-spacer />
        <v-btn
          :prepend-icon="mdiPrinter"
          :disabled="keys.length === 0"
          data-testid="page-qr-print"
          @click="print"
        >
          Print
        </v-btn>
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </AppDialog>
</template>

<style scoped>
.page-qr-dialog__field {
  flex: 1 1 200px;
}
</style>
