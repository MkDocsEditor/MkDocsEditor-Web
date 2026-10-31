<script setup lang="ts">
import type { LinkStatus } from '@/api'

defineProps<{ status: LinkStatus }>()

const LABELS: Record<LinkStatus, { text: string; color: string }> = {
  pending: { text: 'pending', color: 'primary' },
  used: { text: 'used', color: 'success' },
  expired: { text: 'expired', color: '' },
  revoked: { text: 'revoked', color: 'error' },
}
</script>

<template>
  <v-chip size="small" :color="LABELS[status].color" variant="tonal" data-testid="link-status">
    {{ LABELS[status].text }}
  </v-chip>
</template>
