<script setup lang="ts">
import {
  mdiCheck,
  mdiDotsVertical,
  mdiEyeOutline,
  mdiFileDocumentEditOutline,
  mdiHistory,
  mdiOpenInNew,
  mdiPaletteOutline,
  mdiImageSearchOutline,
  mdiPaperclip,
  mdiShareVariant,
  mdiViewSplitVertical,
} from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import type { ResourceModel } from '@/api'
import HistoryDialog from '@/components/history/HistoryDialog.vue'
import LinkPickerDialog from '@/components/pickers/LinkPickerDialog.vue'
import ResourcePickerDialog from '@/components/pickers/ResourcePickerDialog.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import BacklinksList from '@/components/references/BacklinksList.vue'
import ResourcesPanel from '@/components/resources/ResourcesPanel.vue'
import ItemActionItems from '@/components/tree/ItemActionItems.vue'
import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import CursorColorDialog from '@/editor/CursorColorDialog.vue'
import FormatToolbar from '@/editor/FormatToolbar.vue'
import MarkdownEditor from '@/editor/MarkdownEditor.vue'
import type { AuthorHighlightMode } from '@/editor/authorship'
import type { TextReference } from '@/markdown/references'
import MarkdownPreview from '@/markdown/MarkdownPreview.vue'
import { lineRange } from '@/markdown/sourceLines'
import type { ScrollAnchor } from '@/markdown/sourceLines'
import { isImage, resourceKind } from '@/services/icons'
import { copyText } from '@/services/clipboard'
import { joinLink } from '@/services/join'
import { linkDestination } from '@/services/linkPath'
import { authorHighlight, lineNumbers } from '@/composables/preferences'
import { useStored } from '@/composables/useStored'
import { instanceColor, instanceId } from '@/sync/instance'
import { markdownFor } from '@/services/upload'
import { wikiPageUrl } from '@/services/wiki'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

import { connectionBadge } from './document/connectionBadge'
import { useDocumentSession } from './document/useDocumentSession'
import { useEditorInsertion } from './document/useEditorInsertion'
import { useFollow } from './document/useFollow'
import { useJoinJump } from './document/useJoinJump'
import { useSearchText } from './document/useSearchText'

const props = defineProps<{ id: string }>()

const tree = useTreeStore()
const notify = useNotifyStore()
const router = useRouter()
const { mobile } = useDisplay()

const page = computed(() => tree.document(props.id))
const ancestors = computed(() => tree.ancestors(props.id))
const parentId = computed(() => tree.parentOf(props.id)?.id)
const wikiUrl = computed(() => (page.value ? wikiPageUrl(page.value.url) : null))

type Mode = 'edit' | 'split' | 'preview'
const storedMode = useStored<Mode | null>('mkdocseditor.documentMode', null)
/** Following someone needs the editor, without changing the stored choice. */
const editorWanted = ref(false)
const mode = computed<Mode>({
  get: () => {
    const m = storedMode.value ?? (mobile.value ? 'preview' : 'split')
    if (editorWanted.value && m === 'preview') return mobile.value ? 'edit' : 'split'
    return mobile.value && m === 'split' ? 'edit' : m
  },
  set: (m) => {
    editorWanted.value = false
    storedMode.value = m
  },
})
const authorHighlightModes: { value: AuthorHighlightMode; title: string }[] = [
  { value: 'marker', title: 'Strip and marker' },
  { value: 'strip', title: 'Strip next to the line' },
  { value: 'off', title: 'Off' },
]

/** Leaves the preview-only mode, for actions that need the editor on screen. */
function showEditor(): void {
  if (mode.value === 'preview') mode.value = mobile.value ? 'edit' : 'split'
}

/** The files panel; remembered on wide screens, closed by default on phones. */
const filesStored = useStored('mkdocseditor.filesPanel', false)
const filesMobile = ref(false)
const filesOpen = computed<boolean>({
  get: () => (mobile.value ? filesMobile.value : filesStored.value),
  set: (open) => {
    if (mobile.value) filesMobile.value = open
    else filesStored.value = open
  },
})
function closeFilesOnPhone(): void {
  if (mobile.value) filesOpen.value = false
}
const historyOpen = ref(false)

const { session, text, ready, status, peers, ghosts, presenceKnown, onlineUsers } =
  useDocumentSession(
    () => props.id,
    (newId) => {
      void tree.load().catch(() => undefined)
      void router.replace({ name: 'document', params: { id: newId } })
    },
  )
useSearchText(() => props.id, text, ready)
const connection = computed(() => connectionBadge(status.value))

/** Where the editor is while it drives in split mode; the preview shows the same place. */
const editorAnchor = ref<ScrollAnchor | undefined>()

/**
 * Split mode scrolls both panes together. Only the pane the user last touched drives, so the
 * scroll it causes on the other side does not come back.
 */
type Pane = 'editor' | 'preview'
const scrollDriver = ref<Pane>('editor')

// a place from before the preview drove would pull it back once the editor drives again
watch(scrollDriver, (driver) => {
  if (driver === 'preview') editorAnchor.value = undefined
})

function onEditorAnchor(anchor: ScrollAnchor): void {
  if (scrollDriver.value === 'editor') editorAnchor.value = anchor
}

function onPreviewAnchor(anchor: ScrollAnchor): void {
  if (mode.value === 'split' && scrollDriver.value === 'preview')
    editor.value?.scrollToAnchor(anchor)
}

/** While only the preview shows, its lines are what followers of this user see. */
function onPreviewLines(lines: { first: number; last: number } | null): void {
  if (mode.value !== 'preview' || !session.value) return
  session.value.setLocalViewport(lines && lineRange(text.value, lines.first, lines.last))
}
const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)
const editorView = () => editor.value?.getView() ?? null
const { selectedText, replaceSelection, insertSnippets, reveal, revealLine } = useEditorInsertion(
  editorView,
  () => text.value,
  showEditor,
)

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

function openLinkPicker(): void {
  pickerSelection.value = selectedText()
  linkOpen.value = true
}

function openResourcePicker(): void {
  pickerSelection.value = selectedText()
  resourceOpen.value = true
  closeFilesOnPhone()
}

const toolbarOverride = { link: openLinkPicker, image: openResourcePicker }
const shortcutOverride = {
  link: () => (openLinkPicker(), true),
  image: () => (openResourcePicker(), true),
}

function insertFromPicker(snippets: string[]): void {
  if (snippets.length === 1) replaceSelection(snippets[0]!)
  else insertSnippets(snippets)
}

/** Markdown for a resource, relative to this page. */
function markdownOf(resource: ResourceModel): string {
  const destination = linkDestination(tree.path(props.id), tree.linkTarget(resource))
  return markdownFor(resource.name, resourceKind(resource) === 'image', destination)
}

function insertResource(resource: ResourceModel): void {
  insertSnippets([markdownOf(resource)])
  closeFilesOnPhone()
}

async function uploadAndInsert(files: File[]): Promise<void> {
  try {
    insertSnippets(await upload(files))
  } catch {
    // upload() reports it
  }
}

function revealReference(reference: TextReference): void {
  reveal(reference)
  closeFilesOnPhone()
}

/**
 * `?line=12` (from "linked from" lists): select that line once the text is there. The line is
 * one of the server's text, and the stored copy the page is ready with can be older: wait for
 * the server's text, unless the page is offline.
 */
const route = useRoute()
watch(
  () => [ready.value && status.value?.connection !== 'connecting', route.query.line] as const,
  ([isReady, line]) => {
    const number = Number(line)
    if (!isReady || !Number.isInteger(number) || number < 1) return
    showEditor()
    void router.replace({ query: { ...route.query, line: undefined } })
    revealLine(number)
  },
  // after the id watcher below, so a new page's line waits for that page's text
  { flush: 'post' },
)

const auth = useAuthStore()
const follow = useFollow({
  view: editorView,
  peers: () => peers.value,
  ghosts: () => ghosts.value,
  presenceKnown: () => presenceKnown.value,
  onEnded: (name) => notify.push(`${name} has left, no longer following.`),
})
const { following, paused: followPaused } = follow

function startFollowing(instanceId: string): void {
  editorWanted.value = true
  // the editor scrolls along with the one followed, and the preview with it
  scrollDriver.value = 'editor'
  follow.start(instanceId)
}

function followLabel(user: { name: string; instanceId: string }): string {
  return following.value?.instanceId === user.instanceId
    ? `Stop following ${user.name}`
    : `Follow ${user.name}`
}

/** Everybody listed can be followed, this user too: it is then another tab or device of theirs. */
function toggleFollowing(instanceId: string): void {
  if (following.value?.instanceId === instanceId) follow.stop()
  else startFollowing(instanceId)
}

const cursorColorOpen = ref(false)
watch(instanceColor, (color) => session.value?.setLocalColor(color))

// nobody to follow on another page, and the rendered page cannot show where someone is
watch(session, () => follow.stop())
watch(mode, (current) => {
  if (current === 'preview') follow.stop()
})

const jump = useJoinJump({
  view: editorView,
  ready: () => ready.value,
  peers: () => peers.value,
  ghosts: () => ghosts.value,
  presenceKnown: () => presenceKnown.value,
  onFollow: startFollowing,
  lastPosition: (accountId) => session.value?.lastPositionOf(accountId) ?? null,
  onSenderNotFound: () => notify.push('Could not find the position of the person who invited you.'),
})

/** `?join=1&from=…&instance=…`, which `/join/` leads to. Only once, so a reload opens the page normally. */
watch(
  () => route.query.join,
  (join) => {
    if (!join) return
    editorWanted.value = true
    const { from, instance } = route.query
    jump.start(
      typeof from === 'string' ? from : undefined,
      typeof instance === 'string' ? instance : undefined,
    )
    void router.replace({
      query: { ...route.query, join: undefined, from: undefined, instance: undefined },
    })
  },
  { immediate: true },
)

/** Shares the page with a link that leads others to where this user is right now. */
async function share(): Promise<void> {
  const url = joinLink(props.id, auth.user?.id, session.value?.me.value?.instanceId ?? instanceId())
  if (mobile.value && typeof navigator.share === 'function') {
    await navigator.share({ title: page.value?.name, url }).catch(() => undefined)
  } else if (await copyText(url)) {
    notify.success('Link copied. It leads to your position on this page.')
  } else {
    notify.push(url, 'warning')
  }
}
</script>

<template>
  <div class="document-view">
    <div class="document-view__bar px-4 pt-1">
      <ItemBreadcrumbs v-if="!mobile" :ancestors="ancestors" :current="page?.name" />
      <div class="d-flex align-center ga-2 pb-1">
        <h1 class="text-title-large text-truncate flex-grow-1" data-testid="document-title">
          {{ page?.name }}
        </h1>

        <v-avatar-group v-if="onlineUsers.length > 0" data-testid="online-users">
          <v-tooltip
            v-for="user in onlineUsers"
            :key="user.instanceId"
            :text="followLabel(user)"
            location="bottom"
          >
            <template #activator="{ props: tip }">
              <UserAvatar
                v-bind="tip"
                tag="button"
                :name="user.initials"
                :color="user.color"
                :account-id="user.accountId"
                :avatar="user.avatar"
                size="30"
                class="text-body-small"
                :class="{
                  'document-view__avatar--followed': following?.instanceId === user.instanceId,
                }"
                :aria-label="followLabel(user)"
                data-testid="online-user"
                @click="toggleFollowing(user.instanceId)"
              />
            </template>
          </v-tooltip>
        </v-avatar-group>

        <v-chip
          v-if="following"
          color="primary"
          size="small"
          closable
          close-label="Stop following"
          data-testid="following"
          @click:close="follow.stop()"
        >
          Following {{ following.name }}<template v-if="followPaused"> (paused)</template>
        </v-chip>

        <v-chip
          v-if="connection"
          :prepend-icon="connection.icon"
          :color="connection.color"
          size="small"
          data-testid="connection-state"
          :title="connection.text"
        >
          <span v-if="!mobile">{{ connection.text }}</span>
        </v-chip>

        <v-btn-toggle v-model="mode" mandatory density="comfortable" border divided color="primary">
          <v-btn value="edit" :icon="mdiFileDocumentEditOutline" aria-label="Edit" />
          <v-btn
            v-if="!mobile"
            value="split"
            :icon="mdiViewSplitVertical"
            aria-label="Edit and preview"
          />
          <v-btn value="preview" :icon="mdiEyeOutline" aria-label="Preview" />
        </v-btn-toggle>

        <!-- keeps the focus in the editor, because the link needs this user's cursor -->
        <v-btn
          :icon="mdiShareVariant"
          aria-label="Share this page"
          title="Share this page"
          data-testid="share-document"
          @mousedown.prevent
          @click="share"
        />

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
            <v-btn v-bind="menu" :icon="mdiDotsVertical" aria-label="More" />
          </template>
          <v-list>
            <v-list-subheader>Who wrote what?</v-list-subheader>
            <v-list-item
              v-for="option in authorHighlightModes"
              :key="option.value"
              :title="option.title"
              :active="authorHighlight === option.value"
              :append-icon="authorHighlight === option.value ? mdiCheck : undefined"
              :data-testid="`author-highlight-${option.value}`"
              @click="authorHighlight = option.value"
            />
            <v-list-item
              :prepend-icon="mdiPaletteOutline"
              title="My cursor color…"
              data-testid="cursor-color"
              @click="cursorColorOpen = true"
            />
            <v-divider />
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
            <template v-if="page">
              <v-divider />
              <ItemActionItems :item="page" />
            </template>
          </v-list>
        </v-menu>
      </div>
      <v-alert
        v-if="status?.message"
        :type="status.connection === 'closed' ? 'error' : 'info'"
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
      aria-label="Uploading a file"
      data-testid="upload-progress"
    />

    <div v-if="session" class="document-view__panes" :class="`document-view__panes--${mode}`">
      <div
        v-show="mode !== 'preview'"
        class="document-view__pane document-view__pane--editor"
        @wheel.passive="scrollDriver = 'editor'"
        @touchstart.passive="scrollDriver = 'editor'"
        @pointerdown="scrollDriver = 'editor'"
        @keydown="scrollDriver = 'editor'"
      >
        <template v-if="ready && !status?.readOnly">
          <FormatToolbar :view="editorView" :override="toolbarOverride" />
          <v-divider />
        </template>
        <v-progress-linear v-if="!ready" indeterminate aria-label="Loading the page" />
        <MarkdownEditor
          v-else
          ref="editor"
          :key="id"
          class="document-view__editor"
          :session="session"
          :author-highlight="authorHighlight"
          :upload="upload"
          :line-numbers="!mobile && lineNumbers"
          :format-override="shortcutOverride"
          :shown="mode !== 'preview'"
          @change="(t: string) => (text = t)"
          @local-edit="follow.stop()"
          @anchor="onEditorAnchor"
        />
      </div>
      <v-divider v-if="mode === 'split'" vertical />
      <div
        v-show="mode !== 'edit'"
        class="document-view__pane"
        @wheel.passive="scrollDriver = 'preview'"
        @touchstart.passive="scrollDriver = 'preview'"
        @pointerdown="scrollDriver = 'preview'"
        @keydown="scrollDriver = 'preview'"
      >
        <v-progress-linear v-if="!ready" indeterminate aria-label="Loading the page" />
        <MarkdownPreview
          v-else
          :text="text"
          :section-id="parentId"
          :anchor="mode === 'split' && scrollDriver === 'editor' ? editorAnchor : undefined"
          @visible-lines="onPreviewLines"
          @anchor="onPreviewAnchor"
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
        @reveal="revealReference"
      >
        <template #footer>
          <div class="pa-4">
            <v-btn
              :prepend-icon="mdiImageSearchOutline"
              variant="outlined"
              block
              :disabled="!ready || (status?.readOnly ?? true)"
              data-testid="panel-browse"
              @click="openResourcePicker"
            >
              Insert from anywhere in the wiki
            </v-btn>
          </div>
          <v-list-subheader class="px-4">Linked from</v-list-subheader>
          <BacklinksList :id="id" type="document" :reload-key="tree.root" />
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
    <CursorColorDialog v-model="cursorColorOpen" :account-color="session?.me.value?.color" />
    <HistoryDialog v-model="historyOpen" :document-id="id" :read-only="status?.readOnly ?? true" />
  </div>
</template>

<style scoped>
.document-view {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--v-layout-top, 0px));
}
.document-view__avatar--followed {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
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
