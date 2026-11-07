<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiFileDocumentOutline,
  mdiFolderOutline,
  mdiPencil,
  mdiPinOff,
} from '@mdi/js'
import { computed, onMounted, ref, watch } from 'vue'

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

import { detailsOf, nameOf, peopleText, verbOf } from './dashboard/feedText'
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
  return page ? pageMeta.title(page) : pin.name
}

function pinIcon(pin: Pin): string {
  const page = tree.get(pin.documentId)
  return page ? pageMeta.icon(page) : mdiFileDocumentOutline
}

/** The page of an entry by its title while it exists, else by the name in its path. */
function entryName(entry: FeedEntry): string {
  const page = entry.documentId ? tree.get(entry.documentId) : undefined
  return page ? pageMeta.title(page) : nameOf(entry.path)
}

function canUnpin(scope: PinScope): boolean {
  return scope === 'personal' || pins.canPinForEveryone
}

/** Where an entry leads: the page, or the folder found by its path, while it still exists. */
function entryLink(entry: FeedEntry) {
  if (entry.kind === 'deleted') return undefined
  if (entry.itemType === 'document')
    return entry.documentId ? { name: 'document', params: { id: entry.documentId } } : undefined
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
            v-for="pin in pins.pins[group.scope]"
            :key="pin.documentId"
            :to="{ name: 'document', params: { id: pin.documentId } }"
            :title="pinName(pin)"
            :subtitle="
              group.scope === 'family'
                ? `${pinFolder(pin)} · pinned by ${pin.pinnedBy.displayName}`
                : pinFolder(pin)
            "
            data-testid="pin"
          >
            <template #prepend>
              <v-icon :icon="group.scope === 'family' ? mdiAccountGroupOutline : pinIcon(pin)" />
            </template>
            <template v-if="canUnpin(group.scope)" #append>
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
          <v-list-item-subtitle class="text-wrap">{{ detailsOf(entry) }}</v-list-item-subtitle>
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
</style>
