<script setup lang="ts">
import { computed } from 'vue'

import type { ChangeRange } from '@/markdown/changeRanges'
import { linesBetween, rangeOfHunk, showHunk } from '@/services/diff'
import type { DiffHunk } from '@/services/diff'

/**
 * Hunks of a diff, each headed by its section: changed words marked in paired lines, the
 * unchanged lines between hunks folded. A hunk's heading asks to show it in the page.
 */
const props = defineProps<{ hunks: readonly DiffHunk[] }>()
const emit = defineEmits<{ show: [range: ChangeRange] }>()

const hunkViews = computed(() =>
  props.hunks.map((hunk, i) => ({
    hunk,
    lines: showHunk(hunk),
    folded: i > 0 ? linesBetween(props.hunks[i - 1]!, hunk) : hunk.newStart - 1,
  })),
)

function hunkTitle(hunk: DiffHunk): string {
  return hunk.heading ?? 'Start of the page'
}
</script>

<template>
  <div class="history__diff" data-testid="history-diff">
    <section
      v-for="(shown, h) in hunkViews"
      :key="h"
      class="history__hunk"
      data-testid="history-hunk"
    >
      <div v-if="shown.folded > 0" class="history__folded">
        {{ shown.folded === 1 ? '1 unchanged line' : `${shown.folded} unchanged lines` }}
      </div>
      <button
        type="button"
        class="history__hunk-head"
        :title="`Show ${hunkTitle(shown.hunk)} in the page`"
        data-testid="history-hunk-show"
        @click="emit('show', rangeOfHunk(shown.hunk))"
      >
        {{ hunkTitle(shown.hunk) }}
      </button>
      <div
        v-for="(line, i) in shown.lines"
        :key="i"
        class="history__line"
        :class="{
          'history__line--add': line.op === '+',
          'history__line--del': line.op === '-',
        }"
        data-testid="history-line"
      >
        <span class="history__sign" aria-hidden="true">{{
          line.op === '+' ? '+' : line.op === '-' ? '−' : ''
        }}</span>
        <span class="history__line-text"
          ><template v-if="line.pieces"
            ><span
              v-for="(piece, p) in line.pieces"
              :key="p"
              :class="{ 'history__word--changed': piece.changed }"
              >{{ piece.text }}</span
            ></template
          ><template v-else>{{ line.text }}</template></span
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.history__diff {
  font-family: var(--app-font-mono);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: 1.5;
  overflow: auto;
  flex: 1 1 auto;
}
.history__line {
  display: flex;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 0 var(--app-space-2) 0 0;
}
.history__sign {
  flex: 0 0 24px;
  text-align: center;
  user-select: none;
}
.history__line--add {
  background: rgba(var(--v-theme-code-inserted), 0.18);
}
.history__line--del {
  background: rgba(var(--v-theme-code-deleted), 0.18);
}
.history__line--add .history__word--changed {
  background: rgba(var(--v-theme-code-inserted), 0.4);
}
.history__line--del .history__word--changed {
  background: rgba(var(--v-theme-code-deleted), 0.4);
}
.history__folded {
  padding: var(--app-space-1) var(--app-space-4);
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.history__hunk-head {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--app-space-1) var(--app-space-4);
  font: inherit;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: none;
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}
.history__hunk-head:hover,
.history__hunk-head:focus-visible {
  background: rgba(var(--v-theme-primary), 0.08);
}
</style>
