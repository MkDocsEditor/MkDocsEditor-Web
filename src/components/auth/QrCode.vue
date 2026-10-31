<script setup lang="ts">
import QRCode from 'qrcode'
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: string; label: string; size?: number }>(), {
  size: 200,
})

const MARGIN = 2

/** The QR code as one SVG path of dark modules. */
const code = computed(() => {
  try {
    const { modules } = QRCode.create(props.value, { errorCorrectionLevel: 'M' })
    let path = ''
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(x, y)) path += `M${x + MARGIN} ${y + MARGIN}h1v1h-1z`
      }
    }
    return { path, size: modules.size + 2 * MARGIN }
  } catch {
    return null
  }
})
</script>

<template>
  <svg
    v-if="code"
    class="qr-code"
    role="img"
    :aria-label="label"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${code.size} ${code.size}`"
    shape-rendering="crispEdges"
    data-testid="qr-code"
  >
    <!-- Always dark on white, also in dark mode, so phone cameras can read it. -->
    <rect width="100%" height="100%" fill="#fff" />
    <path :d="code.path" fill="#000" />
  </svg>
</template>

<style scoped>
.qr-code {
  display: block;
  border-radius: 4px;
}
</style>
