<script setup lang="ts">
import { mdiArrowLeft, mdiHistory, mdiMagnify } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import AppDialog from '@/components/common/AppDialog.vue'
import HighlightedText from '@/components/tree/HighlightedText.vue'
import { useDebounced } from '@/composables/useDebounced'
import { colorFor, formatSize } from '@/services/icons'
import { plural } from '@/services/names'
import { loadRecentSearches, rememberSearch } from '@/sync/recentSearches'
import { MIN_SEARCH_LENGTH, findMatches, isSearchable, searchWiki } from '@/services/search'
import type { SearchResult } from '@/services/search'
import { formatWhen } from '@/services/time'
import { usePageMetaStore } from '@/stores/pageMeta'
import { usePagesStore } from '@/stores/pages'
import { useTreeStore } from '@/stores/tree'

const open = defineModel<boolean>({ required: true })
const tree = useTreeStore()
const pages = usePagesStore()
const pageMeta = usePageMetaStore()
const router = useRouter()

// Material's search view: docked to the search bar from medium windows up, else the full screen
const { smAndDown: fullScreen } = useDisplay()

const input = ref<string | null>('')
const query = computed(() => (input.value ?? '').trim())
const recent = ref<string[]>([])
const term = useDebounced(() => query.value, 300)

const search = (searchTerm: string) =>
  searchWiki(tree.index, (id) => pages.pages.get(id)?.text, searchTerm, {
    title: (id) => pageMeta.meta(id).title,
    textExcluded: (id) => pageMeta.meta(id).searchExclude,
  })
const found = computed(() => search(term.value))
const results = computed(() => found.value.results)
const tooShort = computed(() => query.value !== '' && !isSearchable(query.value))
const settled = computed(() => term.value === query.value)
const hasBody = computed(() => query.value !== '' || recent.value.length > 0)

watch(open, (isOpen) => {
  if (!isOpen) return
  input.value = ''
  recent.value = loadRecentSearches()
})

function remember(): void {
  if (isSearchable(query.value)) recent.value = rememberSearch(query.value)
}

function searchFor(recentTerm: string): void {
  input.value = recentTerm
  remember()
}

async function choose(result: SearchResult): Promise<void> {
  remember()
  open.value = false
  await router.push({ name: result.item.type, params: { id: result.item.id } })
}

function chooseFirst(): void {
  // right away, not after the delay of the results on screen
  const first = search(query.value).results[0]
  if (first) void choose(first)
  else remember()
}

function details(result: SearchResult): string {
  const { item } = result
  if (item.type === 'document') return item.modtime ? formatWhen(item.modtime) : ''
  if (item.type === 'section') {
    const counts = []
    if (item.documents.length > 0) counts.push(plural(item.documents.length, 'page'))
    if (item.subsections.length > 0) counts.push(plural(item.subsections.length, 'folder'))
    return counts.join(' · ')
  }
  const parts = [formatSize(item.filesize)]
  if (item.modtime) parts.push(formatWhen(item.modtime))
  return parts.join(' · ')
}
</script>

<template>
  <AppDialog
    v-model="open"
    class="search-view"
    :class="{ 'search-view--docked': !fullScreen }"
    :max-width="fullScreen ? undefined : 'var(--app-search-width)'"
    :fullscreen="fullScreen"
    :transition="fullScreen ? 'md-dialog' : 'md-docked'"
    scrollable
  >
    <v-card color="surface-light" :elevation="3">
      <div class="search-view__header">
        <v-btn
          v-if="fullScreen"
          :icon="mdiArrowLeft"
          aria-label="Close search"
          @click="open = false"
        />
        <v-text-field
          v-model="input"
          :prepend-inner-icon="fullScreen ? undefined : mdiMagnify"
          placeholder="Search pages, folders and files…"
          variant="solo"
          density="compact"
          bg-color="transparent"
          flat
          autofocus
          clearable
          hide-details
          data-testid="search-input"
          @keydown.enter="chooseFirst"
        />
      </div>
      <v-divider v-if="hasBody" />
      <v-card-text v-if="hasBody" class="px-2">
        <p
          v-if="pages.progress && query"
          class="text-body-small text-medium-emphasis px-4 pb-2"
          data-testid="search-progress"
        >
          Still fetching pages ({{ pages.progress.done }} of {{ pages.progress.total }}). Some text
          may not be found yet.
        </p>

        <template v-if="query === ''">
          <v-list v-if="recent.length > 0" data-testid="search-recent">
            <v-list-subheader>Recent searches</v-list-subheader>
            <v-list-item
              v-for="recentTerm in recent"
              :key="recentTerm"
              :prepend-icon="mdiHistory"
              :title="recentTerm"
              data-testid="search-recent-term"
              @click="searchFor(recentTerm)"
            />
          </v-list>
        </template>
        <p v-else-if="tooShort" class="text-medium-emphasis pa-4" data-testid="search-too-short">
          Type at least {{ MIN_SEARCH_LENGTH }} characters to search
        </p>
        <v-list v-else-if="results.length > 0" density="comfortable">
          <v-list-item
            v-for="result in results"
            :key="result.item.id"
            data-testid="search-result"
            @click="choose(result)"
          >
            <template #prepend>
              <v-icon :icon="pageMeta.icon(result.item)" :color="colorFor(result.item)" />
            </template>
            <div class="search-result__head">
              <HighlightedText
                class="search-result__name text-title-small"
                :text="result.title"
                :matches="findMatches(result.title, term)"
              />
              <span
                v-if="result.matchCount > 0"
                class="text-body-small text-primary"
                data-testid="search-match-count"
              >
                {{ plural(result.matchCount, 'match', 'matches') }}
              </span>
            </div>
            <div class="search-result__meta text-body-small text-medium-emphasis">
              <!-- the start is what gets cut: the folder right above the result tells the most -->
              <span class="search-result__path"
                ><bdi>{{ result.path.join(' › ') || 'Top level' }}</bdi></span
              >
              <span v-if="details(result)" class="search-result__details">{{
                details(result)
              }}</span>
            </div>
            <div
              v-for="(excerpt, i) in result.excerpts"
              :key="i"
              class="mt-1"
              data-testid="search-excerpt"
            >
              <div v-if="excerpt.heading" class="search-result__heading text-body-small">
                {{ excerpt.heading }}
              </div>
              <div class="search-result__line">
                <template v-if="excerpt.truncatedStart">…</template>
                <HighlightedText :text="excerpt.text" :matches="excerpt.matches" />
                <template v-if="excerpt.truncatedEnd">…</template>
              </div>
            </div>
          </v-list-item>
        </v-list>
        <p v-else-if="settled" class="text-medium-emphasis pa-4">Nothing found.</p>
        <p
          v-if="query !== '' && !tooShort && found.total > results.length"
          class="text-body-small text-medium-emphasis px-4"
          data-testid="search-limited"
        >
          Showing the best {{ results.length }} of {{ found.total }} results. Add a word to narrow
          them down.
        </p>
      </v-card-text>
    </v-card>
  </AppDialog>
</template>

<style>
/* Not scoped: the overlay is rendered outside this component. */
.search-view--docked.v-dialog {
  align-items: flex-start;
}
.search-view--docked.v-dialog > .v-overlay__content {
  margin: var(--app-space-2) 0 0;
  /* the table of a docked search view takes up to 2/3 of the window */
  max-height: 66.67vh;
}
.search-view--docked.v-dialog > .v-overlay__content > .v-card {
  border-radius: var(--md-sys-shape-corner-extra-large);
}
</style>

<style scoped>
.search-view__header {
  display: flex;
  flex: none;
  align-items: center;
  min-height: var(--app-search-height);
  padding: var(--app-space-1);
}
.search-result__head,
.search-result__meta {
  display: flex;
  gap: var(--app-space-2);
  align-items: baseline;
}
.search-result__name,
.search-result__path,
.search-result__heading {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.search-result__path {
  direction: rtl;
  text-align: left;
}
.search-result__details {
  flex-shrink: 0;
  white-space: nowrap;
}
.search-result__heading {
  font-weight: 500;
}
.search-result__line {
  background: rgb(var(--v-theme-code-background));
  color: rgb(var(--v-theme-code-text));
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: var(--app-space-1) var(--app-space-2);
  font-family: var(--app-font-mono);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
