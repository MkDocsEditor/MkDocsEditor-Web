<script setup lang="ts">
import { mdiClose, mdiRobotOutline, mdiUpdate } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

import type { DocumentChanges } from '@/api'
import AppDialog from '@/components/common/AppDialog.vue'
import DiffHunks from '@/components/history/DiffHunks.vue'
import type { ChangeRange } from '@/markdown/changeRanges'
import { describeChangers } from '@/services/changes'
import { formatDate, formatWhen } from '@/services/time'

/**
 * "Changed since your last visit": who changed the page and where, with the changes in a
 * dialog. Both count as seen when closed.
 */
const props = defineProps<{ changes: DocumentChanges }>()
const emit = defineEmits<{
  dismiss: []
  /** Show these lines in the page. */
  show: [range: ChangeRange]
}>()

const open = ref(false)
const { mobile } = useDisplay()
const who = computed(() => describeChangers(props.changes.authors))
const where = computed(() => props.changes.summary.headings.join(', '))
const when = computed(() => (props.changes.since ? formatWhen(props.changes.since.time) : ''))

// looking at the changes is seeing them
watch(open, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen) emit('dismiss')
})

function show(range: ChangeRange): void {
  emit('show', range)
  open.value = false
}
</script>

<template>
  <v-alert
    type="info"
    variant="tonal"
    density="compact"
    :icon="mdiUpdate"
    class="mb-2"
    data-testid="changes-banner"
  >
    <div class="changes-banner">
      <span class="flex-grow-1" data-testid="changes-banner-text">
        Changed since your last visit {{ when }} by {{ who
        }}<template v-if="where"> · {{ where }}</template>
      </span>
      <v-btn variant="text" size="small" data-testid="changes-show" @click="open = true">
        Show changes
      </v-btn>
      <v-btn
        :icon="mdiClose"
        variant="text"
        size="small"
        aria-label="Dismiss"
        data-testid="changes-dismiss"
        @click="emit('dismiss')"
      />
    </div>
  </v-alert>

  <AppDialog v-model="open" size="large" :fullscreen="mobile" scrollable>
    <v-card data-testid="changes-dialog">
      <v-toolbar density="comfortable" color="surface">
        <v-toolbar-title>Changes since your last visit</v-toolbar-title>
        <v-btn :icon="mdiClose" aria-label="Close" @click="open = false" />
      </v-toolbar>
      <v-divider />
      <div class="px-4 py-2">
        <div v-if="changes.since" class="text-body-medium">
          You last saw this page on {{ formatDate(changes.since.time) }}.
        </div>
        <div class="d-flex flex-wrap ga-2 py-2">
          <v-chip
            v-for="author in changes.authors"
            :key="author.accountId ?? author.displayName"
            size="small"
            data-testid="changes-author"
          >
            <span class="changes-dot mr-2" :style="{ background: author.color }" />
            {{ author.displayName }}
            <template v-if="author.agents.length > 0">
              <v-icon :icon="mdiRobotOutline" size="small" class="ml-2 mr-1" />
              {{ author.agents.join(', ') }}
            </template>
          </v-chip>
        </div>
        <div class="text-body-small">
          <span class="changes-added">+{{ changes.summary.linesAdded }}</span>
          <span class="changes-removed ml-2">−{{ changes.summary.linesRemoved }}</span>
          · tap a heading to see it in the page
        </div>
      </div>
      <v-divider />
      <v-card-text class="pa-0">
        <DiffHunks :hunks="changes.hunks" @show="show" />
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="flat" data-testid="changes-done" @click="open = false">
          Got it
        </v-btn>
      </v-card-actions>
    </v-card>
  </AppDialog>
</template>

<style scoped>
.changes-banner {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  flex-wrap: wrap;
}
.changes-dot {
  display: inline-block;
  width: var(--app-space-2);
  height: var(--app-space-2);
  border-radius: 50%;
}
.changes-added {
  color: rgb(var(--v-theme-code-inserted));
}
.changes-removed {
  color: rgb(var(--v-theme-code-deleted));
}
</style>
