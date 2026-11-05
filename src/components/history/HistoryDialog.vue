<script setup lang="ts">
import { mdiArrowLeft, mdiClose, mdiHistory, mdiRestore } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

import { useApi } from '@/api'
import type { Revision } from '@/api'
import AppDialog from '@/components/common/AppDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadError from '@/components/common/LoadError.vue'
import { diffStats, parseUnifiedDiff } from '@/services/diff'
import type { DiffLine } from '@/services/diff'
import { formatDate, formatWhen } from '@/services/time'
import { describeError, useNotifyStore } from '@/stores/notify'

const props = defineProps<{ documentId: string; readOnly?: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ restored: [revision: Revision] }>()

const notify = useNotifyStore()
const { mobile } = useDisplay()

/** null: the backend has no history (git not enabled). */
const revisions = ref<Revision[] | null>([])
const loading = ref(false)
const loadError = ref<unknown>(null)
const selected = ref<Revision | null>(null)

type View = 'changes' | 'current' | 'content'
const view = ref<View>('changes')
const detailLoading = ref(false)
const diffLines = ref<DiffLine[]>([])
const content = ref('')
const detailError = ref<unknown>(null)
const restoreError = ref<unknown>(null)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  selected.value = null
  try {
    revisions.value = await useApi().getHistory(props.documentId)
    const first = revisions.value?.[0]
    if (first && !mobile.value) selected.value = first
  } catch (error) {
    loadError.value = error
  } finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) void load()
})

/** The revision before `revision` in this file's history, if it is loaded. */
function previous(revision: Revision): Revision | undefined {
  const list = revisions.value ?? []
  return list[list.indexOf(revision) + 1]
}

let detailToken = 0
async function loadDetail(): Promise<void> {
  const revision = selected.value
  if (!revision) return
  const token = ++detailToken
  detailLoading.value = true
  detailError.value = null
  restoreError.value = null
  try {
    const api = useApi()
    const before = previous(revision)
    let lines: DiffLine[] = []
    let text = ''
    if (view.value === 'content' || (view.value === 'changes' && !before)) {
      text = await api.getRevisionContent(props.documentId, revision.revision)
    } else {
      const diff =
        view.value === 'changes'
          ? await api.getRevisionDiff(props.documentId, before!.revision, revision.revision)
          : await api.getRevisionDiff(props.documentId, revision.revision, 'current')
      lines = parseUnifiedDiff(diff)
    }
    if (token !== detailToken) return
    diffLines.value = lines
    content.value = text
  } catch (error) {
    if (token === detailToken) detailError.value = error
  } finally {
    if (token === detailToken) detailLoading.value = false
  }
}

watch([selected, view], () => void loadDetail())

const showsContent = computed(
  () =>
    view.value === 'content' ||
    (view.value === 'changes' && selected.value !== null && !previous(selected.value)),
)
const stats = computed(() => diffStats(diffLines.value))

function authorLine(revision: Revision): string {
  const others = revision.coAuthors?.length ?? 0
  return others > 0 ? `${revision.author.name} and ${others} more` : revision.author.name
}

function shortRev(revision: Revision): string {
  return revision.revision.slice(0, 7)
}

/** The first line of the commit message, without the trailers. */
function title(revision: Revision): string {
  return revision.message.split('\n')[0] ?? ''
}

const confirmOpen = ref(false)
const restoring = ref(false)

async function restore(): Promise<void> {
  const revision = selected.value
  if (!revision) return
  restoring.value = true
  restoreError.value = null
  try {
    await useApi().restoreRevision(props.documentId, revision.revision)
    notify.success(`Restored the version of ${formatDate(revision.time)}`)
    emit('restored', revision)
    open.value = false
  } catch (error) {
    restoreError.value = error
  } finally {
    restoring.value = false
  }
}

const viewLabels: Record<View, string> = {
  changes: 'Changes',
  current: 'Compare with now',
  content: 'Text',
}
</script>

<template>
  <AppDialog v-model="open" size="large" :fullscreen="mobile" scrollable>
    <v-card class="history" data-testid="history-dialog">
      <v-toolbar density="comfortable" color="surface">
        <v-btn
          v-if="mobile && selected"
          :icon="mdiArrowLeft"
          aria-label="Back to the list"
          @click="selected = null"
        />
        <v-toolbar-title>
          <v-icon :icon="mdiHistory" size="small" class="mr-2" />Versions
        </v-toolbar-title>
        <v-btn :icon="mdiClose" aria-label="Close" @click="open = false" />
      </v-toolbar>
      <v-divider />

      <v-card-text class="history__body pa-0">
        <v-progress-linear v-if="loading" indeterminate />
        <LoadError
          v-else-if="loadError"
          class="ma-4"
          title="Could not load the version history"
          :error="loadError"
          @retry="load"
        />
        <v-empty-state
          v-else-if="revisions === null"
          title="No version history"
          text="This server has no version history (git is turned off)."
        />
        <v-empty-state
          v-else-if="revisions.length === 0"
          title="No versions yet"
          text="Changes are saved a few minutes after editing and then show up here."
        />

        <div v-else class="history__layout">
          <v-list
            v-show="!mobile || !selected"
            class="history__list"
            lines="three"
            data-testid="history-list"
          >
            <v-list-item
              v-for="revision in revisions"
              :key="revision.revision"
              :active="selected?.revision === revision.revision"
              color="primary"
              data-testid="history-entry"
              @click="selected = revision"
            >
              <v-list-item-title>{{ formatWhen(revision.time) }}</v-list-item-title>
              <v-list-item-subtitle>{{ authorLine(revision) }}</v-list-item-subtitle>
              <v-list-item-subtitle class="text-body-small">
                {{ title(revision) }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <div v-if="selected" class="history__detail" data-testid="history-detail">
            <div class="history__detail-head pa-4">
              <div class="flex-grow-1">
                <div class="text-title-medium">{{ formatDate(selected.time) }}</div>
                <div class="text-body-medium text-medium-emphasis">
                  {{ authorLine(selected) }} · {{ title(selected) }} · {{ shortRev(selected) }}
                </div>
              </div>
              <v-btn
                v-if="!readOnly && selected !== revisions[0]"
                color="primary"
                variant="outlined"
                :prepend-icon="mdiRestore"
                :loading="restoring"
                data-testid="history-restore"
                @click="confirmOpen = true"
              >
                Restore
              </v-btn>
            </div>
            <v-tabs v-model="view" class="px-4">
              <v-tab v-for="(label, key) in viewLabels" :key="key" :value="key">{{ label }}</v-tab>
            </v-tabs>
            <v-divider />
            <v-progress-linear v-if="detailLoading" indeterminate />
            <v-alert
              v-if="restoreError"
              type="error"
              role="alert"
              class="ma-4"
              title="Restore failed"
              :text="describeError(restoreError)"
              data-testid="history-restore-error"
            />
            <LoadError
              v-if="detailError"
              class="ma-4"
              title="Could not load the version"
              :error="detailError"
              @retry="loadDetail"
            />
            <pre v-else-if="showsContent" class="history__text" data-testid="history-content">{{
              content
            }}</pre>
            <template v-else>
              <div v-if="!detailLoading" class="text-body-small text-medium-emphasis px-4 py-1">
                <template v-if="diffLines.length === 0">No differences</template>
                <template v-else>
                  <span class="history__added">+{{ stats.added }}</span>
                  <span class="history__removed ml-2">−{{ stats.removed }}</span>
                  <template v-if="view === 'current'"> · green was added since</template>
                </template>
              </div>
              <div class="history__diff" data-testid="history-diff">
                <div
                  v-for="(line, i) in diffLines"
                  :key="i"
                  class="history__line"
                  :class="`history__line--${line.kind}`"
                >
                  <span class="history__sign" aria-hidden="true">{{
                    line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''
                  }}</span>
                  <span class="history__line-text">{{
                    line.kind === 'hunk' ? '…' : line.text
                  }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <ConfirmDialog
      v-model="confirmOpen"
      title="Restore this version?"
      :text="
        selected
          ? `The text goes back to the state of ${formatDate(selected.time)}. This is a normal change and can be undone.`
          : ''
      "
      confirm-text="Restore"
      @confirm="restore"
    />
  </AppDialog>
</template>

<style scoped>
.history__body {
  min-height: 60vh;
}
.history__layout {
  display: flex;
  min-height: 60vh;
  height: 100%;
}
.history__list {
  flex: 0 0 300px;
  overflow-y: auto;
  border-right: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.history__detail {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.history__detail-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  flex-wrap: wrap;
}
.history__text,
.history__diff {
  font-family: var(--app-font-mono);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: 1.5;
  overflow: auto;
  flex: 1 1 auto;
}
.history__text {
  padding: var(--app-space-2) var(--app-space-4);
  white-space: pre-wrap;
  word-break: break-word;
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
.history__line--hunk {
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.history__added {
  color: rgb(var(--v-theme-code-inserted));
}
.history__removed {
  color: rgb(var(--v-theme-code-deleted));
}
@media (max-width: 959px) {
  .history__list {
    flex: 1 1 auto;
    border-right: none;
  }
}
</style>
