<script setup lang="ts">
import { computed } from 'vue'

import type { CreatedLink } from '@/api'
import CopyField from '@/components/auth/CopyField.vue'
import QrCode from '@/components/auth/QrCode.vue'
import { roleLabel } from '@/services/accountRules'
import { formatTime } from '@/services/time'

const props = defineProps<{ link: CreatedLink | null; title: string }>()
const emit = defineEmits<{ close: [] }>()

/** The backend builds the URL when `clientUrl` is configured; otherwise this client does. */
const url = computed(() => {
  if (!props.link) return ''
  if (props.link.url) return props.link.url
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
  return `${base}/${props.link.link.kind}#${props.link.token}`
})
</script>

<template>
  <v-dialog :model-value="link !== null" max-width="480" @update:model-value="emit('close')">
    <v-card v-if="link" :title="title" data-testid="link-result">
      <v-card-text>
        <p class="mb-3">
          Hand the link over in person (messenger, QR code). It works only once and is valid until
          {{ formatTime(link.link.expiresAt) }}.
          <template v-if="link.link.kind === 'invite'">
            Role: <strong>{{ roleLabel(link.link.role) }}</strong
            >.
          </template>
        </p>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
          The link is shown only now.
        </v-alert>
        <div class="d-flex justify-center mb-4">
          <QrCode :value="url" :size="220" label="QR code of the link" />
        </div>
        <CopyField :value="url" label="Link" testid="link-url" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="emit('close')">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
