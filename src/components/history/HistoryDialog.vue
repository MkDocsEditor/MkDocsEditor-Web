<script setup lang="ts">
import {
  mdiAlertOutline,
  mdiArrowLeft,
  mdiClose,
  mdiHistory,
  mdiRestore,
  mdiRobotOutline,
  mdiUndo,
} from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

import { ApiError, useApi, useAuthApi } from '@/api'
import type { Revision } from '@/api'
import AppDialog from '@/components/common/AppDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadError from '@/components/common/LoadError.vue'
import DiffHunks from '@/components/history/DiffHunks.vue'
import { hunksOfUnifiedDiff, hunkStats } from '@/services/diff'
import type { DiffHunk } from '@/services/diff'
import type { ChangeRange } from '@/markdown/changeRanges'
import { formatDate, formatWhen } from '@/services/time'
import { describeError, useNotifyStore } from '@/stores/notify'

const props = defineProps<{ documentId: string; readOnly?: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{
  restored: [revision: Revision]
  /** Show these lines in the page; the dialog closes. */
  show: [range: ChangeRange]
}>()

const notify = useNotifyStore()
const { mobile } = useDisplay()

/** null: the backend has no history (git not enabled). */
const revisions = ref<Revision[] | null>([])
const loading = ref(false)
const loadError = ref<unknown>(null)
const selected = ref<Revision | null>(null)
/** Whether the server can undo a single change (`revert`). */
const canRevert = ref(false)
/** Whether the server can restore a single section (`blame` covers it). */
const canRestoreSection = ref(false)
/** Whether the server can say beforehand if an undo would work (`revert-check`). */
const canCheckRevert = ref(false)

type View = 'changes' | 'current' | 'content'
const view = ref<View>('changes')
const detailLoading = ref(false)
const hunks = ref<DiffHunk[]>([])
const content = ref('')
const detailError = ref<unknown>(null)
const restoreError = ref<unknown>(null)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  selected.value = null
  try {
    void useAuthApi()
      .serverInfo()
      .then((info) => {
        canRevert.value = info.features?.includes('revert') === true
        canRestoreSection.value = info.features?.includes('blame') === true
        canCheckRevert.value = info.features?.includes('revert-check') === true
      })
      .catch(() => undefined)
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
    let found: DiffHunk[] = []
    let text = ''
    if (view.value === 'content' || (view.value === 'changes' && !before)) {
      text = await api.getRevisionContent(props.documentId, revision.revision)
    } else {
      const answer =
        view.value === 'changes'
          ? await api.getRevisionHunks(props.documentId, before!.revision, revision.revision)
          : await api.getRevisionHunks(props.documentId, revision.revision, 'current')
      found = typeof answer === 'string' ? hunksOfUnifiedDiff(answer) : answer
    }
    if (token !== detailToken) return
    hunks.value = found
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
const stats = computed(() => hunkStats(hunks.value))
/** Opens the page at a hunk's lines, found again by its heading in today's text. */
function showInPage(range: ChangeRange): void {
  emit('show', range)
  open.value = false
}

function nameOf(author: Revision['author']): string {
  return author.displayName || author.name
}

/** The agents (app tokens) of a commit; older backends only name the tokens. */
function agentsOf(revision: Revision): string[] {
  return revision.agents?.map((agent) => agent.name) ?? revision.appTokens ?? []
}

function authorLine(revision: Revision): string {
  const others = revision.coAuthors?.length ?? 0
  const name = nameOf(revision.author)
  const people = others > 0 ? `${name} and ${others} more` : name
  const tokens = agentsOf(revision)
  return tokens.length > 0 ? `${people} via ${tokens.join(', ')}` : people
}

/** The message the backend gives every edit it saves: it says nothing the summary does not. */
function generic(revision: Revision): boolean {
  return title(revision) === `Update ${revision.path}`
}

/**
 * "+5 −1 · Setup, Install" from the commit's summary, after a message someone wrote (a git
 * commit, a restore); older backends: the message.
 */
function summaryLine(revision: Revision): string {
  const summary = revision.summary
  if (!summary) return title(revision)
  const counts = `+${summary.linesAdded} −${summary.linesRemoved}`
  const parts = [counts]
  if (summary.headings.length > 0) parts.push(summary.headings.join(', '))
  if (!generic(revision)) parts.unshift(title(revision))
  return parts.join(' · ')
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

/**
 * Whether the change of a commit can be undone: not the file's first commit (that would empty
 * it; restore an older version instead), and not one that changed no lines (a move).
 */
function revertable(revision: Revision): boolean {
  if (props.readOnly || !canRevert.value || !previous(revision)) return false
  const summary = revision.summary
  return !summary || summary.linesAdded + summary.linesRemoved > 0
}

/** A section of the selected version to put back, waiting for confirmation. */
const sectionToRestore = ref<{ heading: string; occurrence: number } | null>(null)
const sectionConfirmOpen = ref(false)

/** Restoring a section of the newest version would change nothing it has not got already. */
function sectionRestorable(hunk: DiffHunk): boolean {
  return (
    !props.readOnly &&
    canRestoreSection.value &&
    hunk.heading !== null &&
    selected.value !== null &&
    selected.value !== revisions.value?.[0]
  )
}

function askRestoreSection(hunk: DiffHunk): void {
  if (hunk.heading === null) return
  sectionToRestore.value = { heading: hunk.heading, occurrence: hunk.headingOccurrence || 1 }
  sectionConfirmOpen.value = true
}

async function restoreSection(): Promise<void> {
  const revision = selected.value
  const section = sectionToRestore.value
  if (!revision || !section) return
  restoring.value = true
  restoreError.value = null
  try {
    await useApi().restoreSection(
      props.documentId,
      revision.revision,
      section.heading,
      section.occurrence,
    )
    notify.success(`Restored “${section.heading}” to the version of ${formatDate(revision.time)}`)
    emit('restored', revision)
    open.value = false
  } catch (error) {
    restoreError.value = error
  } finally {
    restoring.value = false
  }
}

/** Why a restore failed, in words. */
function restoreFailure(error: unknown): string {
  if (error instanceof ApiError && error.code === 'section-not-found') {
    const heading = sectionToRestore.value?.heading ?? 'The section'
    return error.details.in === 'current'
      ? `“${heading}” is no longer in the page. Restore the whole version instead, or copy it from the text.`
      : `“${heading}” is not in this version.`
  }
  return describeError(error)
}

/** The people and agents of a commit, for the confirmation. */
function makers(revision: Revision): { people: string[]; agents: string[] } {
  return {
    people: [revision.author, ...(revision.coAuthors ?? [])].map(nameOf),
    agents: agentsOf(revision),
  }
}

const undoOpen = ref(false)
const undoing = ref(false)
const undoError = ref<unknown>(null)
const undoMakers = computed(() => (selected.value ? makers(selected.value) : null))
/** Undoing removes the changes of everyone in the commit, which matters with more than one. */
const undoShared = computed(() => {
  const m = undoMakers.value
  return m ? m.people.length + m.agents.length > 1 : false
})

function askUndo(): void {
  undoError.value = null
  view.value = 'changes' // the confirmation shows this commit's changes
  undoOpen.value = true
}

async function undo(): Promise<void> {
  const revision = selected.value
  if (!revision) return
  undoing.value = true
  undoError.value = null
  try {
    await useApi().revertRevision(props.documentId, revision.revision)
    notify.success(`Undid the change of ${formatDate(revision.time)}`)
    undoOpen.value = false
    open.value = false
  } catch (error) {
    undoError.value = error
  } finally {
    undoing.value = false
  }
}

/** Where later changes are in the way of an undo, e.g. " in Setup, Top of the page". */
function conflictPlaces(headings: (string | null)[] | undefined): string {
  const named = (headings ?? []).map((h) => h ?? 'Top of the page')
  return named.length > 0 ? ` in ${named.join(', ')}` : ''
}

/**
 * Why the selected change cannot be undone, asked when it opens so the undo does not fail only
 * after the tap; null while unknown, when it can, or on servers without the check.
 */
const undoBlocked = ref<string | null>(null)
let undoCheck = 0

watch([selected, canCheckRevert], async ([revision, canCheck]) => {
  const check = ++undoCheck
  undoBlocked.value = null
  if (!revision || !canCheck || !revertable(revision)) return
  try {
    const answer = await useApi().checkRevert(props.documentId, revision.revision)
    if (check !== undoCheck || answer.possible) return
    if (answer.code === 'nothing-to-revert')
      undoBlocked.value = "Can't undo: this change was undone already or edited away."
    else if (answer.code === 'revert-conflict')
      undoBlocked.value = `Can't undo: later changes${conflictPlaces(answer.details?.headings)} are in the way.`
  } catch {
    // keep the button; the undo itself still says why it failed
  }
})

function undoFailure(error: unknown): { type: 'error' | 'info'; text: string } {
  if (error instanceof ApiError && error.code === 'revert-conflict') {
    const where = conflictPlaces(error.details.headings as (string | null)[] | undefined)
    return {
      type: 'error',
      text: `Not undone: the same lines were changed again later${where}. Nothing was changed; edit them by hand.`,
    }
  }
  if (error instanceof ApiError && error.code === 'nothing-to-revert')
    return { type: 'info', text: 'This change is already gone: it was undone before, or by hand.' }
  return { type: 'error', text: describeError(error) }
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
              <v-list-item-subtitle>
                <v-icon
                  v-if="agentsOf(revision).length > 0"
                  :icon="mdiRobotOutline"
                  size="x-small"
                  aria-hidden="true"
                  data-testid="history-agent"
                />
                {{ authorLine(revision) }}
              </v-list-item-subtitle>
              <v-list-item-subtitle class="text-body-small" data-testid="history-summary">
                {{ summaryLine(revision) }}
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
              <span
                v-if="revertable(selected) && undoBlocked"
                class="text-body-medium text-medium-emphasis"
                data-testid="history-undo-blocked"
              >
                {{ undoBlocked }}
              </span>
              <v-btn
                v-else-if="revertable(selected)"
                color="primary"
                variant="outlined"
                :prepend-icon="mdiUndo"
                data-testid="history-undo"
                @click="askUndo"
              >
                Undo this change
              </v-btn>
              <v-btn
                v-if="!readOnly && selected !== revisions[0]"
                color="primary"
                variant="outlined"
                :prepend-icon="mdiRestore"
                :loading="restoring"
                data-testid="history-restore"
                @click="confirmOpen = true"
              >
                Restore this version
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
              :text="restoreFailure(restoreError)"
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
                <template v-if="hunks.length === 0">No differences</template>
                <template v-else>
                  <span class="history__added">+{{ stats.added }}</span>
                  <span class="history__removed ml-2">−{{ stats.removed }}</span>
                  <template v-if="view === 'current'"> · green was added since</template>
                </template>
              </div>
              <DiffHunks :hunks="hunks" @show="showInPage">
                <template #actions="{ hunk }">
                  <v-btn
                    v-if="sectionRestorable(hunk)"
                    variant="text"
                    size="small"
                    :prepend-icon="mdiRestore"
                    class="mr-2"
                    :title="`Put “${hunk.heading}” back as it was in this version`"
                    data-testid="history-restore-section"
                    @click="askRestoreSection(hunk)"
                  >
                    Restore “{{ hunk.heading }}”
                  </v-btn>
                </template>
              </DiffHunks>
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

    <ConfirmDialog
      v-model="sectionConfirmOpen"
      title="Restore this section?"
      :text="
        selected && sectionToRestore
          ? `“${sectionToRestore.heading}” and its subsections go back to the state of ${formatDate(selected.time)}. The rest of the page stays as it is. This is a normal change and can be undone.`
          : ''
      "
      confirm-text="Restore section"
      @confirm="restoreSection"
    />

    <AppDialog v-model="undoOpen" size="medium" :fullscreen="mobile" scrollable>
      <v-card v-if="selected && undoMakers" data-testid="history-undo-dialog">
        <v-card-title>Undo this change?</v-card-title>
        <v-card-text class="pb-0">
          <p class="mb-2">
            The lines of {{ formatDate(selected.time) }} go back to how they were before. Later
            changes stay. Undoing is a change of its own, so it can be undone too.
          </p>
          <p class="mb-2" data-testid="history-undo-makers">
            Made by {{ undoMakers.people.join(', ')
            }}<template v-if="undoMakers.agents.length > 0">
              via {{ undoMakers.agents.join(', ') }}</template
            >.
          </p>
          <v-alert
            v-if="undoShared"
            type="warning"
            variant="tonal"
            density="compact"
            :icon="mdiAlertOutline"
            class="mb-2"
            data-testid="history-undo-shared"
          >
            More than one made this change: undoing it removes the changes of all of them.
          </v-alert>
          <v-alert
            v-if="undoError"
            :type="undoFailure(undoError).type"
            variant="tonal"
            role="alert"
            class="mb-2"
            data-testid="history-undo-error"
          >
            {{ undoFailure(undoError).text }}
          </v-alert>
        </v-card-text>
        <v-progress-linear v-if="detailLoading" indeterminate />
        <div class="history__undo-diff">
          <DiffHunks :hunks="hunks" :linked="false" />
        </div>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="undoOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="undoing"
            :disabled="detailLoading"
            data-testid="history-undo-confirm"
            @click="undo"
          >
            Undo
          </v-btn>
        </v-card-actions>
      </v-card>
    </AppDialog>
  </AppDialog>
</template>

<style scoped>
.history__undo-diff {
  max-height: 40vh;
  overflow: auto;
  border-block: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
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
.history__text {
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
