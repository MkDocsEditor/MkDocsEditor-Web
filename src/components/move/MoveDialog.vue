<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, useApi } from '@/api'
import type { MoveRequest, MoveResult, SectionModel, TreeItem } from '@/api'
import TreeBrowser from '@/components/tree/TreeBrowser.vue'
import { ITEM_LABELS, plural, stripMarkdownExtension, validateName } from '@/services/names'
import { followMovedRoute } from '@/services/redirects'
import { useMoveStore } from '@/stores/move'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

import { moveErrorText } from './moveErrors'

/**
 * Moves (and optionally renames) a folder, page or file. Every change of folder or name asks
 * the backend for a dry run first and shows which links it would update; "Move" then sends
 * the same request for real (`docs/references.md` section 5).
 */
const move = useMoveStore()
const tree = useTreeStore()
const notify = useNotifyStore()
const router = useRouter()

const open = computed({
  get: () => move.item !== null,
  set: (value) => {
    if (!value && !applying.value) move.close()
  },
})

const item = ref<TreeItem | null>(null)
const name = ref('')
const sectionId = ref('')
const preview = ref<MoveResult | null>(null)
const problem = ref('')
const loading = ref(false)
const applying = ref(false)

const originalName = computed(() => item.value?.name ?? '')
const parentId = computed(() => (item.value ? (tree.parentOf(item.value.id)?.id ?? '') : ''))

watch(
  () => move.item,
  (next) => {
    item.value = next
    preview.value = null
    problem.value = ''
    if (!next) return
    name.value = next.name
    sectionId.value = move.target ?? tree.parentOf(next.id)?.id ?? tree.root?.id ?? ''
  },
  { immediate: true },
)

/** A folder cannot move into itself or a folder inside it. */
const blocked = computed(() => {
  const ids: string[] = []
  const walk = (section: SectionModel) => {
    ids.push(section.id)
    section.subsections.forEach(walk)
  }
  if (item.value?.type === 'section') walk(item.value)
  return ids
})

const targetPath = computed(() => tree.folderLabel(sectionId.value))

const cleanName = computed(() =>
  item.value?.type === 'document' ? stripMarkdownExtension(name.value) : name.value.trim(),
)
const nameValid = computed(() => validateName(cleanName.value))

function request(dryRun: boolean): MoveRequest | null {
  const current = item.value
  if (!current || nameValid.value !== true) return null
  const renamed = cleanName.value !== originalName.value
  const moved = sectionId.value !== parentId.value
  if (!renamed && !moved) return null
  return {
    type: current.type,
    id: current.id,
    ...(moved ? { parent: sectionId.value } : {}),
    ...(renamed ? { name: cleanName.value } : {}),
    dryRun,
  }
}

const unchanged = computed(() => nameValid.value === true && request(true) === null)

let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
watch(
  () => [item.value?.id, sectionId.value, cleanName.value] as const,
  () => {
    // whatever was still on its way belongs to the previous state of the form
    clearTimeout(timer)
    const mine = ++generation
    loading.value = false
    preview.value = null
    problem.value = ''
    const body = request(true)
    if (!body) return
    loading.value = true
    timer = setTimeout(async () => {
      try {
        const result = await useApi().move(body)
        if (mine === generation) preview.value = result
      } catch (error) {
        if (mine === generation) problem.value = moveErrorText(error)
      } finally {
        if (mine === generation) loading.value = false
      }
    }, 250)
  },
)

onBeforeUnmount(() => clearTimeout(timer))

const changedLines = computed(
  () => preview.value?.documents.reduce((sum, doc) => sum + doc.edits.length, 0) ?? 0,
)

async function apply(): Promise<void> {
  const body = request(false)
  if (!body || !preview.value) return
  applying.value = true
  try {
    const result = await useApi().move(body)
    await tree.load().catch(() => undefined)
    const pages = result.documents.length
    notify.success(
      pages > 0
        ? `Moved to ${result.newPath}; links updated in ${plural(pages, 'page')}`
        : `Moved to ${result.newPath}`,
    )
    followMovedRoute(router, result.moved)
    move.close()
  } catch (error) {
    problem.value = moveErrorText(error)
    if (error instanceof ApiError && error.status === 409) preview.value = null
  } finally {
    applying.value = false
  }
}

const title = computed(() => {
  const kind = ITEM_LABELS[item.value?.type ?? 'document']
  return `Move ${kind} “${item.value?.name ?? ''}”`
})
</script>

<template>
  <v-dialog v-model="open" max-width="720" :fullscreen="$vuetify.display.xs" scrollable>
    <v-card v-if="item" data-testid="move-dialog">
      <v-card-title class="text-wrap">{{ title }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="name"
          label="Name"
          :suffix="item.type === 'document' ? '.md' : undefined"
          :error-messages="nameValid === true ? [] : [nameValid]"
          density="compact"
          class="mb-1"
          data-testid="move-name"
        />
        <p class="text-body-2 mb-1">
          Into <strong data-testid="move-target">{{ targetPath }}</strong>
        </p>
        <TreeBrowser
          v-model:section="sectionId"
          :types="[]"
          :disabled-ids="blocked"
          search-placeholder="Search folders…"
        />
        <v-divider class="my-3" />
        <div class="move-dialog__preview" aria-live="polite" data-testid="move-preview">
          <v-progress-linear
            v-if="loading"
            indeterminate
            color="primary"
            class="mb-2"
            data-testid="move-loading"
          />
          <v-alert
            v-if="problem"
            type="warning"
            variant="tonal"
            density="compact"
            :text="problem"
            data-testid="move-problem"
          />
          <p v-else-if="unchanged" class="text-medium-emphasis">Choose another folder or name.</p>
          <template v-else-if="preview">
            <p class="mb-2">
              New place: <code data-testid="move-new-path">{{ preview.newPath }}</code>
            </p>
            <p v-if="preview.moved.length > 1" class="mb-2">
              {{ plural(preview.moved.length - 1, 'item') }} inside move along. Open pages and old
              links follow.
            </p>
            <p class="mb-2" data-testid="move-summary">
              <template v-if="preview.documents.length === 0 && preview.config.length === 0">
                No links need to change.
              </template>
              <template v-else-if="preview.documents.length > 0">
                Links are updated in {{ plural(preview.documents.length, 'page') }} ({{
                  plural(changedLines, 'line')
                }}):
              </template>
            </p>
            <v-expansion-panels variant="accordion" multiple>
              <v-expansion-panel
                v-for="doc in preview.documents"
                :key="doc.documentId"
                data-testid="move-document"
              >
                <v-expansion-panel-title>
                  <div class="text-truncate">
                    <div class="text-body-2 text-truncate">{{ doc.newPath }}</div>
                    <div class="text-caption text-medium-emphasis">
                      {{ plural(doc.edits.length, 'line') }}
                    </div>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div v-for="edit in doc.edits" :key="edit.line" class="move-dialog__edit">
                    <div class="text-caption text-medium-emphasis">Line {{ edit.line }}</div>
                    <div
                      class="move-dialog__line move-dialog__line--before"
                      v-text="`− ${edit.before}`"
                    />
                    <div
                      class="move-dialog__line move-dialog__line--after"
                      v-text="`+ ${edit.after}`"
                    />
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
              <v-expansion-panel v-if="preview.config.length > 0" data-testid="move-config">
                <v-expansion-panel-title>
                  <div>
                    <div class="text-body-2">mkdocs.yml</div>
                    <div class="text-caption text-medium-emphasis">
                      {{ plural(preview.config.length, 'line') }} (navigation and theme)
                    </div>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div v-for="edit in preview.config" :key="edit.line" class="move-dialog__edit">
                    <div class="text-caption text-medium-emphasis">Line {{ edit.line }}</div>
                    <div
                      class="move-dialog__line move-dialog__line--before"
                      v-text="`− ${edit.before}`"
                    />
                    <div
                      class="move-dialog__line move-dialog__line--after"
                      v-text="`+ ${edit.after}`"
                    />
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="applying" @click="move.close()">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!preview || loading"
          :loading="applying"
          data-testid="move-apply"
          @click="apply"
        >
          Move
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.move-dialog__preview {
  min-height: 48px;
}
.move-dialog__edit + .move-dialog__edit {
  margin-top: 8px;
}
.move-dialog__line {
  font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 2px 6px;
  border-radius: 4px;
}
.move-dialog__line--before {
  color: rgb(var(--v-theme-code-deleted));
  background: rgba(var(--v-theme-code-deleted), 0.08);
}
.move-dialog__line--after {
  color: rgb(var(--v-theme-code-inserted));
  background: rgba(var(--v-theme-code-inserted), 0.08);
}
</style>
