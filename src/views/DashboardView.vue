<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiDragVertical,
  mdiFileDocumentOutline,
  mdiFolderOutline,
  mdiPencil,
  mdiPinOff,
} from '@mdi/js'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { useApi } from '@/api'
import type { FeedEntry, Pin, PinScope } from '@/api'
import LoadError from '@/components/common/LoadError.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import SectionHeader from '@/components/common/SectionHeader.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import SyncStatus from '@/components/tree/SyncStatus.vue'
import MarkdownPreview from '@/markdown/MarkdownPreview.vue'
import { formatDate, formatWhen } from '@/services/time'
import { usePageMetaStore } from '@/stores/pageMeta'
import { usePagesStore } from '@/stores/pages'
import { usePinsStore } from '@/stores/pins'
import { useTreeStore } from '@/stores/tree'

import { detailsOf, headingsText, nameOf, peopleText, verbOf } from './dashboard/feedText'
import { useFeed } from './dashboard/useFeed'

/**
 * "What's going on": the start page. The wiki's own start page (`index.md` of the top folder)
 * comes first, then the pinned pages, then the feed of changes: who changed what, when and where.
 */
const tree = useTreeStore()
const pageMeta = usePageMetaStore()
const pages = usePagesStore()
const pins = usePinsStore()
const feed = useFeed()

onMounted(() => {
  pins.ensureLoaded()
  void feed.refresh()
})

const index = computed(() => tree.root?.documents.find((d) => d.name.toLowerCase() === 'index'))

/** The text from the server, fetched again whenever the page changes. */
const fetched = ref<{ id: string; modtime: string; text: string } | null>(null)
const failed = ref(false)

watch(
  () => [index.value?.id, index.value?.modtime] as const,
  async ([id, modtime]) => {
    failed.value = false
    if (!id || modtime === undefined) return
    try {
      const text = await useApi().getDocumentContent(id)
      if (index.value?.id === id) fetched.value = { id, modtime, text }
    } catch {
      if (index.value?.id === id) failed.value = true
    }
  },
  { immediate: true },
)

/** The newest text there is: the server's, else the copy on this device (offline). */
const indexText = computed(() => {
  const doc = index.value
  if (!doc) return null
  if (fetched.value?.id === doc.id) return fetched.value.text
  return pages.pages.get(doc.id)?.text ?? null
})

const PIN_GROUPS: { scope: PinScope; title: string; empty: string }[] = [
  {
    scope: 'family',
    title: 'Pinned for everyone',
    empty: 'Editors can pin a page for everyone from its menu.',
  },
  { scope: 'personal', title: 'My pins', empty: 'Pin a page from its menu to find it here.' },
]

/** The folder of a pinned page, from the tree when it has the page (it may have moved). */
function pinFolder(pin: Pin): string {
  const path = tree.get(pin.documentId) ? tree.path(pin.documentId) : pin.path
  const cut = path.lastIndexOf('/')
  return cut < 0 ? 'Top folder' : path.slice(0, cut)
}

function pinName(pin: Pin): string {
  const page = tree.get(pin.documentId)
  return page ? pageMeta.title(page) : (pin.title ?? pin.name)
}

function pinIcon(pin: Pin): string {
  const page = tree.get(pin.documentId)
  return page ? pageMeta.icon(page) : mdiFileDocumentOutline
}

/** The page of an entry by its title while it exists, else by the name in its path. */
function entryName(entry: FeedEntry): string {
  const page = entry.documentId ? tree.get(entry.documentId) : undefined
  return page ? pageMeta.title(page) : (entry.title ?? nameOf(entry.path))
}

function canUnpin(scope: PinScope): boolean {
  return scope === 'personal' || pins.canPinForEveryone
}

// Changing the order of the pins: drag a pin to its new place, or move it with Alt+↑ and Alt+↓.
const draggedPin = ref<{ scope: PinScope; documentId: string } | null>(null)
/** Where the dragged pin would go: before the pin at `place` (or after the last one). */
const pinDrop = ref<{ scope: PinScope; place: number } | null>(null)

function onPinDragStart(event: DragEvent, scope: PinScope, pin: Pin): void {
  // otherwise it is the drag of a link, as everywhere else
  if (!pins.canReorder(scope)) return
  draggedPin.value = { scope, documentId: pin.documentId }
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onPinDragEnd(): void {
  draggedPin.value = null
  pinDrop.value = null
}

function onPinDragOver(event: DragEvent, scope: PinScope, place: number): void {
  if (draggedPin.value?.scope !== scope) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const lowerHalf = event.clientY > box.top + box.height / 2
  pinDrop.value = { scope, place: lowerHalf ? place + 1 : place }
}

function onPinDrop(event: DragEvent, scope: PinScope): void {
  const dragged = draggedPin.value
  const drop = pinDrop.value
  onPinDragEnd()
  if (dragged?.scope !== scope || drop?.scope !== scope) return
  event.preventDefault()
  const from = pins.pins?.[scope].findIndex((p) => p.documentId === dragged.documentId) ?? -1
  if (from < 0) return
  // the places after the pin move up by one once it is taken out
  void pins.move(scope, dragged.documentId, drop.place > from ? drop.place - 1 : drop.place)
}

/** The line that shows where the dragged pin would go. */
function dropClass(scope: PinScope, place: number): string | undefined {
  const drop = pinDrop.value
  if (drop?.scope !== scope) return undefined
  if (drop.place === place) return 'dashboard-view__pin--drop-before'
  const last = (pins.pins?.[scope].length ?? 0) - 1
  return place === last && drop.place === last + 1 ? 'dashboard-view__pin--drop-after' : undefined
}

async function movePin(scope: PinScope, pin: Pin, to: number): Promise<void> {
  if (!pins.canReorder(scope)) return
  const moving = pins.move(scope, pin.documentId, to)
  // the list shows the new order right away; the moved pin keeps the focus
  await nextTick()
  document
    .querySelector<HTMLElement>(
      `[data-testid="pins-${scope}"] [data-pin-id="${CSS.escape(pin.documentId)}"]`,
    )
    ?.focus()
  await moving
}

/** Where an entry leads: the page, or the folder found by its path, while it still exists. */
function entryLink(entry: FeedEntry) {
  if (entry.kind === 'deleted') return undefined
  if (entry.itemType === 'document') {
    if (!entry.documentId) return undefined
    // an edit opens the page at the first section it touched that is still there
    const headings = entry.kind === 'edited' ? (entry.summary?.headings ?? []) : []
    return {
      name: 'document',
      params: { id: entry.documentId },
      query: headings.length > 0 ? { section: headings } : {},
    }
  }
  const section = tree.byPath(entry.path)
  return section?.type === 'section' ? { name: 'section', params: { id: section.id } } : undefined
}
</script>

<template>
  <v-container class="dashboard-view pb-16">
    <PageHeader title="What’s going on" testid="dashboard-title">
      <template #actions>
        <v-btn :prepend-icon="mdiFolderOutline" :to="{ name: 'files' }" data-testid="all-files">
          All files
        </v-btn>
      </template>
      <SyncStatus class="mt-1" />
    </PageHeader>

    <v-card
      v-if="index"
      variant="outlined"
      class="dashboard-view__index mb-4"
      data-testid="dashboard-index"
    >
      <v-btn
        :icon="mdiPencil"
        size="small"
        variant="text"
        class="dashboard-view__index-open"
        :to="{ name: 'document', params: { id: index.id } }"
        aria-label="Open the start page of the wiki"
        data-testid="dashboard-index-open"
      />
      <MarkdownPreview v-if="indexText !== null" :text="indexText" :section-id="tree.root?.id" />
      <v-alert v-else-if="failed" type="warning" density="compact">
        The start page of the wiki could not be loaded.
      </v-alert>
      <v-progress-linear v-else indeterminate class="mt-4" />
    </v-card>

    <template v-if="pins.available">
      <section v-for="group in PIN_GROUPS" :key="group.scope" class="mb-4">
        <SectionHeader :title="group.title" />
        <v-list
          v-if="pins.pins?.[group.scope].length"
          lines="two"
          class="app-card-list py-0"
          :data-testid="`pins-${group.scope}`"
        >
          <v-list-item
            v-for="(pin, place) in pins.pins[group.scope]"
            :key="pin.documentId"
            :to="{ name: 'document', params: { id: pin.documentId } }"
            :title="pinName(pin)"
            :subtitle="
              group.scope === 'family'
                ? `${pinFolder(pin)} · pinned by ${pin.pinnedBy.displayName}`
                : pinFolder(pin)
            "
            :class="dropClass(group.scope, place)"
            :aria-keyshortcuts="
              pins.canReorder(group.scope) ? 'Alt+ArrowUp Alt+ArrowDown' : undefined
            "
            :data-pin-id="pin.documentId"
            data-testid="pin"
            @dragstart="onPinDragStart($event, group.scope, pin)"
            @dragend="onPinDragEnd"
            @dragover="onPinDragOver($event, group.scope, place)"
            @drop="onPinDrop($event, group.scope)"
            @keydown.alt.up.prevent.stop="movePin(group.scope, pin, place - 1)"
            @keydown.alt.down.prevent.stop="movePin(group.scope, pin, place + 1)"
          >
            <template #prepend>
              <v-icon :icon="group.scope === 'family' ? mdiAccountGroupOutline : pinIcon(pin)" />
            </template>
            <template v-if="canUnpin(group.scope)" #append>
              <v-icon
                v-if="pins.canReorder(group.scope) && pins.pins[group.scope].length > 1"
                :icon="mdiDragVertical"
                class="dashboard-view__pin-handle me-1"
                title="Drag to change the order, or press Alt+↑ and Alt+↓"
                aria-hidden="true"
              />
              <v-btn
                :icon="mdiPinOff"
                size="small"
                :aria-label="`Unpin ${pinName(pin)}`"
                data-testid="unpin"
                @click.stop.prevent="pins.setPinned(group.scope, pin.documentId, false)"
              />
            </template>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-medium text-medium-emphasis">{{ group.empty }}</p>
      </section>
    </template>

    <section v-if="feed.available.value !== false" class="mb-4">
      <SectionHeader title="Changes" />
      <LoadError
        v-if="feed.error.value && feed.entries.value.length === 0"
        title="Could not load the changes"
        :error="feed.error.value"
        @retry="feed.refresh()"
      />
      <v-list
        v-else-if="feed.entries.value.length > 0"
        lines="two"
        class="app-card-list py-0"
        data-testid="feed"
      >
        <v-list-item
          v-for="entry in feed.entries.value"
          :key="entry.id"
          :to="entryLink(entry)"
          data-testid="feed-entry"
        >
          <template #prepend>
            <v-avatar-group class="me-4 dashboard-view__authors">
              <UserAvatar
                v-for="author in entry.authors.slice(0, 3)"
                :key="author.accountId ?? author.displayName"
                :name="author.displayName"
                :color="author.color"
                :account-id="author.accountId"
                :avatar="author.avatar"
                size="32"
                class="text-body-small"
              />
            </v-avatar-group>
          </template>
          <v-list-item-title class="text-wrap">
            {{ peopleText(entry.authors) }} {{ verbOf(entry) }}
            <strong>{{ entryName(entry) }}</strong>
          </v-list-item-title>
          <v-list-item-subtitle class="text-wrap">
            {{ detailsOf(entry) }}
            <template v-if="entry.summary?.linesAdded || entry.summary?.linesRemoved">
              ·
              <!-- a count of zero is left out: "+4", "−2" or "+4 −2" -->
              <span
                v-if="entry.summary.linesAdded"
                class="dashboard-view__added"
                data-testid="feed-added"
                >+{{ entry.summary.linesAdded }}</span
              >
              <span
                v-if="entry.summary.linesRemoved"
                class="dashboard-view__removed"
                data-testid="feed-removed"
                >−{{ entry.summary.linesRemoved }}</span
              >
            </template>
            <span v-if="headingsText(entry)" class="d-block" data-testid="feed-headings">
              {{ headingsText(entry) }}
            </span>
          </v-list-item-subtitle>
          <template #append>
            <span class="text-body-small text-medium-emphasis ms-2" :title="formatDate(entry.time)">
              {{ formatWhen(entry.time) }}
            </span>
          </template>
        </v-list-item>
      </v-list>
      <p
        v-else-if="feed.available.value && !feed.loading.value"
        class="text-body-medium text-medium-emphasis"
      >
        No changes yet.
      </p>
      <v-progress-linear v-if="feed.loading.value" indeterminate class="mt-2" />
      <div v-if="feed.next.value" class="d-flex justify-center mt-2">
        <v-btn :disabled="feed.loading.value" data-testid="feed-more" @click="feed.loadMore()">
          Show older changes
        </v-btn>
      </div>
    </section>
  </v-container>
</template>

<style scoped>
/* added and removed lines as the diff views show them (the code palette, as on Android) */
.dashboard-view__added {
  color: rgb(var(--v-theme-code-inserted));
  font-weight: 500;
}
.dashboard-view__removed {
  color: rgb(var(--v-theme-code-deleted));
  font-weight: 500;
}
.dashboard-view__index {
  padding: var(--app-space-4);
}

/* floats, so the text runs beside it rather than below a row of its own */
.dashboard-view__index-open {
  float: right;
  margin: calc(-1 * var(--app-space-2)) calc(-1 * var(--app-space-2)) 0 var(--app-space-2);
}

/* the page as part of this one: no scrolling or padding of its own, and no title */
.dashboard-view__index :deep(.markdown-preview) {
  height: auto;
  overflow: visible;
  padding: 0;
}
.dashboard-view__index :deep(.markdown-preview > h1:first-child) {
  display: none;
}
.dashboard-view__index :deep(.markdown-preview > :first-child),
.dashboard-view__index :deep(.markdown-preview > h1:first-child + *) {
  margin-top: 0;
}
.dashboard-view__index :deep(.markdown-preview > :last-child) {
  margin-bottom: 0;
}

/* shows on the pin under the pointer or with the focus, a hint that pins can be dragged */
.dashboard-view__pin-handle {
  opacity: 0;
  cursor: grab;
  transition: opacity 0.15s;
}
.v-list-item:hover .dashboard-view__pin-handle,
.v-list-item:focus-visible .dashboard-view__pin-handle {
  opacity: var(--v-medium-emphasis-opacity);
}
.dashboard-view__pin--drop-before {
  box-shadow: inset 0 2px 0 rgb(var(--v-theme-primary));
}
.dashboard-view__pin--drop-after {
  box-shadow: inset 0 -2px 0 rgb(var(--v-theme-primary));
}
</style>
