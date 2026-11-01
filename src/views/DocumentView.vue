<script setup lang="ts">
import {
  mdiAccountEdit,
  mdiCloudCheckOutline,
  mdiCloudOffOutline,
  mdiCloudSyncOutline,
  mdiDotsVertical,
  mdiEyeOutline,
  mdiFileDocumentEditOutline,
  mdiHistory,
  mdiLockOutline,
  mdiOpenInNew,
  mdiImageSearchOutline,
  mdiPaperclip,
  mdiViewSplitVertical,
} from '@mdi/js'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import { EditorSelection } from '@codemirror/state'

import type { ResourceModel } from '@/api'
import HistoryDialog from '@/components/history/HistoryDialog.vue'
import LinkPickerDialog from '@/components/pickers/LinkPickerDialog.vue'
import ResourcePickerDialog from '@/components/pickers/ResourcePickerDialog.vue'
import ResourcesPanel from '@/components/resources/ResourcesPanel.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import FormatToolbar from '@/editor/FormatToolbar.vue'
import MarkdownEditor from '@/editor/MarkdownEditor.vue'
import { insertionFor } from '@/editor/upload'
import type { TextReference } from '@/markdown/references'
import MarkdownPreview from '@/markdown/MarkdownPreview.vue'
import { isImage, resourceKind } from '@/services/icons'
import { linkDestination } from '@/services/linkPath'
import { initials } from '@/services/names'
import { local, readJson, writeJson } from '@/services/storage'
import { markdownFor } from '@/services/upload'
import { wikiPageUrl } from '@/services/wiki'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'
import { createDocumentSession } from '@/sync'
import type { DocumentSession } from '@/sync'

const props = defineProps<{ id: string }>()

const tree = useTreeStore()
const notify = useNotifyStore()
const router = useRouter()
const { mobile } = useDisplay()

const document = computed(() => tree.document(props.id))
const ancestors = computed(() => tree.ancestors(props.id))
const parentId = computed(() => tree.parentOf(props.id)?.id)
const wikiUrl = computed(() => (document.value ? wikiPageUrl(document.value.url) : null))

type Mode = 'edit' | 'split' | 'preview'
const MODE_KEY = 'mkdocseditor.documentMode'
const storedMode = ref<Mode | null>(readJson<Mode>(local(), MODE_KEY))
const mode = computed<Mode>({
  get: () => {
    const m = storedMode.value ?? (mobile.value ? 'preview' : 'split')
    return mobile.value && m === 'split' ? 'edit' : m
  },
  set: (m) => {
    storedMode.value = m
    writeJson(local(), MODE_KEY, m)
  },
})
const showAuthorship = ref(false)

/** The files panel; remembered on wide screens, closed by default on phones. */
const FILES_KEY = 'mkdocseditor.filesPanel'
const filesStored = ref(readJson<boolean>(local(), FILES_KEY) ?? false)
const filesMobile = ref(false)
const filesOpen = computed<boolean>({
  get: () => (mobile.value ? filesMobile.value : filesStored.value),
  set: (open) => {
    if (mobile.value) filesMobile.value = open
    else {
      filesStored.value = open
      writeJson(local(), FILES_KEY, open)
    }
  },
})
const historyOpen = ref(false)

const session = shallowRef<DocumentSession | null>(null)
const text = ref('')
const ready = ref(false)
const topLine = ref(0)
const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)
const editorView = () => editor.value?.getView() ?? null

/** Pasted or dropped files go into the folder of the page. */
const uploading = ref(0)
async function upload(files: File[]): Promise<string[]> {
  const folder = parentId.value
  if (!folder) return []
  uploading.value++
  try {
    const created = await tree.uploadFiles(folder, files)
    return created.map((r) => markdownFor(r.name, isImage(r.name)))
  } catch (error) {
    notify.error(error, 'Upload failed')
    throw error
  } finally {
    uploading.value--
  }
}

/** The link and image pickers replace the toolbar buttons and Ctrl+K / Ctrl+Shift+K. */
const linkOpen = ref(false)
const resourceOpen = ref(false)
const pickerSelection = ref('')

function selectedText(): string {
  const view = editorView()
  if (!view) return ''
  const { from, to } = view.state.selection.main
  return view.state.sliceDoc(from, to)
}

function openLinkPicker(): void {
  pickerSelection.value = selectedText()
  linkOpen.value = true
}

function openResourcePicker(): void {
  pickerSelection.value = selectedText()
  resourceOpen.value = true
  if (mobile.value) filesOpen.value = false
}

const toolbarOverride = { link: openLinkPicker, image: openResourcePicker }
const shortcutOverride = {
  link: () => (openLinkPicker(), true),
  image: () => (openResourcePicker(), true),
}

/** Replaces the selection (or inserts at the cursor) and puts the cursor after it. */
function replaceSelection(text: string): void {
  const view = editorView()
  if (!view || view.state.readOnly) return
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.insert',
    scrollIntoView: true,
  })
  view.focus()
}

function insertFromPicker(snippets: string[]): void {
  if (snippets.length === 1) replaceSelection(snippets[0]!)
  else insertSnippets(snippets)
}

/** Inserts snippets at the cursor, on lines of their own (like pasted files). */
function insertSnippets(snippets: string[]): void {
  const view = editorView()
  if (!view || snippets.length === 0 || view.state.readOnly) return
  if (mode.value === 'preview') mode.value = mobile.value ? 'edit' : 'split'
  const at = view.state.selection.main.head
  const insert = insertionFor(view.state.doc, at, snippets)
  view.dispatch({
    changes: { from: at, insert },
    selection: { anchor: at + insert.length },
    userEvent: 'input.insert',
    scrollIntoView: true,
  })
  view.focus()
}

/** Markdown for a resource, relative to this page. */
function markdownOf(resource: ResourceModel): string {
  const destination = linkDestination(tree.path(props.id), tree.linkTarget(resource))
  return markdownFor(resource.name, resourceKind(resource) === 'image', destination)
}

function insertResource(resource: ResourceModel): void {
  insertSnippets([markdownOf(resource)])
  if (mobile.value) filesOpen.value = false
}

async function uploadAndInsert(files: File[]): Promise<void> {
  try {
    insertSnippets(await upload(files))
  } catch {
    // upload() reports it
  }
}

function reveal(reference: TextReference): void {
  const view = editorView()
  if (!view) return
  if (mode.value === 'preview') mode.value = mobile.value ? 'edit' : 'split'
  const length = view.state.doc.length
  view.dispatch({
    selection: EditorSelection.range(
      Math.min(reference.from, length),
      Math.min(reference.to, length),
    ),
    scrollIntoView: true,
  })
  view.focus()
  if (mobile.value) filesOpen.value = false
}

/** Set while following a server-side rename: the session already moved to the new id. */
let renamedTo: string | null = null

function onRenamed(newId: string): void {
  renamedTo = newId
  void tree.load().catch(() => undefined)
  void router.replace({ name: 'document', params: { id: newId } })
}

watch(
  () => props.id,
  (id) => {
    if (id === renamedTo) {
      renamedTo = null
      return
    }
    session.value?.close()
    const next = createDocumentSession(id, { onRenamed })
    session.value = next
    ready.value = false
    text.value = next.getText()
    next.ready
      .then(() => {
        if (session.value === next) {
          text.value = next.getText()
          ready.value = true
        }
      })
      .catch(() => {
        // status.message is shown
      })
  },
  { immediate: true },
)
onBeforeUnmount(() => session.value?.close())

const status = computed(() => session.value?.status.value)
const peers = computed(() => session.value?.peers.value ?? [])
/** Online users: distinct usernames (one user can have several tabs or devices). */
const onlineUsers = computed(() => {
  const seen = new Map<string, { name: string; color: string }>()
  for (const peer of peers.value) {
    if (!seen.has(peer.username))
      seen.set(peer.username, { name: peer.displayName || peer.username, color: peer.color })
  }
  return [...seen.values()]
})

const connection = computed(() => {
  const s = status.value
  if (!s) return null
  switch (s.connection) {
    case 'online':
      return s.unsynced
        ? { icon: mdiCloudSyncOutline, color: 'info', text: 'Saving …' }
        : { icon: mdiCloudCheckOutline, color: 'success', text: 'Saved' }
    case 'connecting':
      return { icon: mdiCloudSyncOutline, color: 'info', text: 'Connecting …' }
    case 'offline':
      return {
        icon: mdiCloudOffOutline,
        color: 'warning',
        text: s.unsynced ? 'Offline – changes stay here' : 'Offline',
      }
    case 'snapshot':
      return { icon: mdiLockOutline, color: 'default', text: 'Read only' }
    case 'closed':
      return { icon: mdiCloudOffOutline, color: 'error', text: 'Disconnected' }
  }
  return null
})
</script>

<template>
  <div class="document-view">
    <div class="document-view__bar px-3 pt-1">
      <ItemBreadcrumbs v-if="!mobile" :ancestors="ancestors" :current="document?.name" />
      <div class="d-flex align-center ga-2 pb-1">
        <h1 class="document-view__title text-truncate flex-grow-1" data-testid="document-title">
          {{ document?.name }}
        </h1>

        <v-avatar-group v-if="onlineUsers.length > 0" data-testid="online-users">
          <v-tooltip
            v-for="user in onlineUsers"
            :key="user.name"
            :text="user.name"
            location="bottom"
          >
            <template #activator="{ props: tip }">
              <v-avatar v-bind="tip" :color="user.color" size="30" class="text-caption text-white">
                {{ initials(user.name) }}
              </v-avatar>
            </template>
          </v-tooltip>
        </v-avatar-group>

        <v-chip
          v-if="connection"
          :prepend-icon="connection.icon"
          :color="connection.color"
          size="small"
          variant="tonal"
          data-testid="connection-state"
          :title="connection.text"
        >
          <span v-if="!mobile">{{ connection.text }}</span>
        </v-chip>

        <v-btn-toggle
          v-model="mode"
          mandatory
          density="compact"
          variant="outlined"
          divided
          color="primary"
        >
          <v-btn value="edit" :icon="mdiFileDocumentEditOutline" aria-label="Edit" />
          <v-btn
            v-if="!mobile"
            value="split"
            :icon="mdiViewSplitVertical"
            aria-label="Edit and preview"
          />
          <v-btn value="preview" :icon="mdiEyeOutline" aria-label="Preview" />
        </v-btn-toggle>

        <v-btn
          :icon="mdiPaperclip"
          :variant="filesOpen ? 'tonal' : 'text'"
          :color="filesOpen ? 'primary' : undefined"
          aria-label="Files"
          title="Files"
          :aria-pressed="filesOpen"
          data-testid="toggle-files"
          @click="filesOpen = !filesOpen"
        />

        <v-menu>
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" :icon="mdiDotsVertical" variant="text" aria-label="More" />
          </template>
          <v-list density="compact">
            <v-list-item
              :prepend-icon="mdiAccountEdit"
              :title="showAuthorship ? 'Hide authors' : 'Who wrote what?'"
              :disabled="!session || session.authorship.value.length === 0"
              @click="showAuthorship = !showAuthorship"
            />
            <v-list-item
              :prepend-icon="mdiHistory"
              title="Versions"
              data-testid="open-history"
              @click="historyOpen = true"
            />
            <v-list-item
              v-if="wikiUrl"
              :prepend-icon="mdiOpenInNew"
              title="View in the wiki"
              :href="wikiUrl"
              target="_blank"
              rel="noopener"
            />
          </v-list>
        </v-menu>
      </div>
      <v-alert
        v-if="status?.message"
        :type="status.connection === 'closed' ? 'error' : 'info'"
        variant="tonal"
        density="compact"
        class="mb-2"
        data-testid="session-message"
      >
        {{ status.message }}
      </v-alert>
    </div>

    <v-divider />
    <v-progress-linear
      v-if="uploading > 0"
      indeterminate
      color="primary"
      aria-label="Uploading a file"
      data-testid="upload-progress"
    />

    <div v-if="session" class="document-view__panes" :class="`document-view__panes--${mode}`">
      <div v-show="mode !== 'preview'" class="document-view__pane document-view__pane--editor">
        <template v-if="ready && !status?.readOnly">
          <FormatToolbar :view="editorView" :override="toolbarOverride" />
          <v-divider />
        </template>
        <v-skeleton-loader v-if="!ready" type="paragraph@3" class="pa-4" />
        <MarkdownEditor
          v-else
          ref="editor"
          :key="id"
          class="document-view__editor"
          :session="session"
          :show-authorship="showAuthorship"
          :upload="upload"
          :line-numbers="!mobile"
          :format-override="shortcutOverride"
          @change="(t: string) => (text = t)"
          @top-line="(l: number) => (topLine = l)"
        />
      </div>
      <v-divider v-if="mode === 'split'" vertical />
      <div v-show="mode !== 'edit'" class="document-view__pane">
        <v-skeleton-loader v-if="!ready" type="paragraph@3" class="pa-4" />
        <MarkdownPreview
          v-else
          :text="text"
          :section-id="parentId"
          :top-line="mode === 'split' ? topLine : undefined"
        />
      </div>
    </div>
    <v-navigation-drawer
      v-model="filesOpen"
      location="end"
      :temporary="mobile"
      width="320"
      data-testid="files-drawer"
    >
      <ResourcesPanel
        v-if="filesOpen"
        :text="text"
        :document-id="id"
        :read-only="!ready || (status?.readOnly ?? true)"
        :uploading="uploading > 0"
        @insert="insertResource"
        @upload="uploadAndInsert"
        @reveal="reveal"
      >
        <template #footer>
          <div class="pa-4">
            <v-btn
              :prepend-icon="mdiImageSearchOutline"
              variant="tonal"
              block
              :disabled="!ready || (status?.readOnly ?? true)"
              data-testid="panel-browse"
              @click="openResourcePicker"
            >
              Insert from anywhere in the wiki
            </v-btn>
          </div>
        </template>
      </ResourcesPanel>
    </v-navigation-drawer>
    <LinkPickerDialog
      v-model="linkOpen"
      :document-id="id"
      :text="text"
      :selection="pickerSelection"
      @insert="replaceSelection"
    />
    <ResourcePickerDialog
      v-model="resourceOpen"
      :document-id="id"
      :selection="pickerSelection"
      @insert="insertFromPicker"
    />
    <HistoryDialog v-model="historyOpen" :document-id="id" :read-only="status?.readOnly ?? true" />
  </div>
</template>

<style scoped>
.document-view {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--v-layout-top, 0px));
}
.document-view__title {
  font-size: 1.25rem;
  font-weight: 500;
  min-width: 0;
}
.document-view__panes {
  flex: 1;
  display: flex;
  min-height: 0;
}
.document-view__pane {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.document-view__pane--editor {
  display: flex;
  flex-direction: column;
}
.document-view__editor {
  flex: 1 1 0;
}
</style>
