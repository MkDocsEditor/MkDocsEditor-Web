<script setup lang="ts">
import { mdiCheck } from '@mdi/js'
import { computed } from 'vue'

import { authorHighlight, lineNumbers, syncScroll } from '@/composables/preferences'
import { contrastRatio } from '@/plugins/codeColors'
import { instanceColor, setInstanceColor } from '@/sync/instance'

import type { AuthorHighlightMode } from './authorship'

/**
 * How the editor looks, next to the text so the change shows at once: the same values as under
 * Settings > Editor, plus the cursor color of this tab. Applies live, without a confirm button.
 */
const props = defineProps<{
  /** Editor and preview side by side: then sync scrolling matters. */
  split: boolean
  /** Phones never show line numbers. */
  lineNumbersShown: boolean
  accountColor?: string
}>()

const authorModes: { value: AuthorHighlightMode; title: string }[] = [
  { value: 'off', title: 'Off' },
  { value: 'strip', title: 'Strip' },
  { value: 'marker', title: 'Strip and marker' },
]

/** Cursor colors that are told apart easily and work on both themes. */
const CURSOR_COLORS = [
  '#1971c2',
  '#0c8599',
  '#2f9e44',
  '#66a80f',
  '#f08c00',
  '#e8590c',
  '#e03131',
  '#c2255c',
  '#9c36b5',
  '#6741d9',
  '#3b5bdb',
  '#868e96',
]

const current = computed(() => instanceColor.value ?? props.accountColor ?? null)

/** The check mark in white or black, whichever stands out on the swatch. */
function checkColor(color: string): string {
  return contrastRatio(color, '#ffffff') >= contrastRatio(color, '#000000') ? '#ffffff' : '#000000'
}
</script>

<template>
  <v-card class="view-panel" data-testid="view-panel">
    <v-card-text class="d-flex flex-column ga-4">
      <div>
        <div id="view-panel-authors" class="text-label-large mb-2">Who wrote what</div>
        <v-btn-toggle
          v-model="authorHighlight"
          mandatory
          divided
          border
          color="primary"
          density="comfortable"
          aria-labelledby="view-panel-authors"
          data-testid="view-author-highlight"
        >
          <v-btn
            v-for="mode in authorModes"
            :key="mode.value"
            :value="mode.value"
            :data-testid="`author-highlight-${mode.value}`"
          >
            {{ mode.title }}
          </v-btn>
        </v-btn-toggle>
      </div>

      <v-switch
        v-if="split"
        v-model="syncScroll"
        color="primary"
        label="Sync scrolling in split view"
        hide-details
        data-testid="toggle-sync-scroll"
      />
      <v-switch
        v-if="lineNumbersShown"
        v-model="lineNumbers"
        color="primary"
        label="Line numbers"
        hide-details
        data-testid="toggle-line-numbers"
      />

      <div>
        <div id="view-panel-color" class="text-label-large mb-1">My cursor color</div>
        <p class="text-body-small text-medium-emphasis mb-2">
          How others see your cursor from this tab, until you close it.
        </p>
        <div
          class="view-panel__swatches"
          role="radiogroup"
          aria-labelledby="view-panel-color"
          data-testid="cursor-colors"
        >
          <button
            v-for="color in CURSOR_COLORS"
            :key="color"
            type="button"
            role="radio"
            class="view-panel__swatch"
            :style="{ background: color }"
            :aria-checked="current === color"
            :aria-label="color"
            :data-testid="`cursor-color-${color.slice(1)}`"
            @click="setInstanceColor(color)"
          >
            <v-icon
              v-if="current === color"
              :icon="mdiCheck"
              :color="checkColor(color)"
              size="18"
            />
          </button>
        </div>
        <v-btn
          v-if="instanceColor"
          size="small"
          class="mt-2"
          data-testid="cursor-color-reset"
          @click="setInstanceColor(null)"
        >
          Use my account color
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.view-panel {
  width: min(360px, calc(100vw - 2 * var(--app-space-4)));
}

.view-panel__swatches {
  display: grid;
  grid-template-columns: repeat(6, 32px);
  gap: var(--app-space-2);
}

.view-panel__swatch {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.view-panel__swatch:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
