<script setup lang="ts">
import { mdiArrowLeft, mdiPrinter } from '@mdi/js'
import { computed } from 'vue'

import QrCode from '@/components/auth/QrCode.vue'
import { useQrStore } from '@/stores/qr'

/** A sheet of QR code stickers to print: the code, the page and the label under it. */
const props = defineProps<{ keys: string[] }>()

const qr = useQrStore()
qr.ensureLoaded()

const stickers = computed(() =>
  props.keys.map((key) => {
    const code = qr.codes?.codes.find((c) => c.key === key)
    return { key, url: qr.urlFor(key), title: code?.title, label: code?.label }
  }),
)

function print(): void {
  window.print()
}
</script>

<template>
  <v-container class="qr-print-view">
    <div class="d-flex flex-wrap align-center ga-2 mb-4 qr-print-view__actions">
      <v-btn :prepend-icon="mdiArrowLeft" variant="text" :to="{ name: 'qr-codes' }">
        QR codes
      </v-btn>
      <v-spacer />
      <span class="text-body-medium text-medium-emphasis">
        {{ stickers.length === 1 ? '1 sticker' : `${stickers.length} stickers` }}, about 4 cm wide
      </span>
      <v-btn
        color="primary"
        :prepend-icon="mdiPrinter"
        :disabled="stickers.length === 0"
        data-testid="qr-print"
        @click="print"
      >
        Print
      </v-btn>
    </div>
    <div class="qr-print-view__sheet" data-testid="qr-sheet">
      <figure
        v-for="sticker in stickers"
        :key="sticker.key"
        class="qr-print-view__sticker"
        data-testid="qr-sticker"
      >
        <QrCode :value="sticker.url" :label="`QR code for ${sticker.key}`" :size="128" />
        <figcaption>
          <strong>{{ sticker.title ?? sticker.key }}</strong>
          <span v-if="sticker.label">{{ sticker.label }}</span>
          <span class="qr-print-view__key">{{ sticker.key }}</span>
        </figcaption>
      </figure>
    </div>
  </v-container>
</template>

<style scoped>
/* stylelint-disable color-no-hex -- stickers are printed black on white */
.qr-print-view__sheet {
  display: grid;
  grid-template-columns: repeat(auto-fill, 4.4cm);
  gap: var(--app-space-4);
}
.qr-print-view__sticker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-1);
  width: 4.4cm;
  padding: var(--app-space-2);
  border: 1px dashed #9e9e9e;
  border-radius: var(--md-sys-shape-corner-small);
  background: #fff;
  color: #000;
  break-inside: avoid;
}
.qr-print-view__sticker :deep(svg) {
  width: 4cm;
  height: 4cm;
}
.qr-print-view__sticker figcaption {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.qr-print-view__key {
  font-family: var(--app-font-mono);
  font-size: var(--md-sys-typescale-label-small-size);
  color: #555;
}
@media print {
  .qr-print-view {
    max-width: none;
    padding: 0;
  }
  .qr-print-view__actions {
    display: none !important;
  }
}
</style>

<style>
/* only the sheet goes on paper */
@media print {
  .v-app-bar,
  .v-navigation-drawer,
  .v-bottom-navigation,
  .v-snackbar {
    display: none !important;
  }
  .v-main {
    padding: 0 !important;
  }
}
</style>
