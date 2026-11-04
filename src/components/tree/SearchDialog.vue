<script setup lang="ts">
import { mdiHistory, mdiMagnify } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import HighlightedText from '@/components/tree/HighlightedText.vue'
import { useDebounced } from '@/composables/useDebounced'
import { colorFor, formatSize, iconFor } from '@/services/icons'
import { plural } from '@/services/names'
import { loadRecentSearches, rememberSearch } from '@/sync/recentSearches'
import { MIN_SEARCH_LENGTH, findMatches, isSearchable, searchWiki } from '@/services/search'
import type { SearchResult } from '@/services/search'
import { formatWhen } from '@/services/time'
import { usePagesStore } from '@/stores/pages'
import { useTreeStore } from '@/stores/tree'

const open = defineModel<boolean>({ required: true })
const tree = useTreeStore()
const pages = usePagesStore()
const router = useRouter()

const input = ref<string | null>('')
const query = computed(() => (input.value ?? '').trim())
const recent = ref<string[]>([])
const term = useDebounced(() => query.value, 300)

const search = (searchTerm: string) =>
  searchWiki(tree.index, (id) => pages.pages.get(id)?.text, searchTerm)
const found = computed(() => search(term.value))
const results = computed(() => found.value.results)
const tooShort = computed(() => query.value !== '' && !isSearchable(query.value))
const settled = computed(() => term.value === query.value)

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
  <v-dialog v-model="open" max-width="640" :fullscreen="$vuetify.display.xs" scrollable>
    <v-card>
      <v-card-text class="pb-0 flex-grow-0">
        <v-text-field
          v-model="input"
          :prepend-inner-icon="mdiMagnify"
          placeholder="Search pages, folders and files…"
          variant="solo-filled"
          flat
          autofocus
          clearable
          hide-details
          data-testid="search-input"
          @keydown.enter="chooseFirst"
        />
      </v-card-text>
      <v-card-text class="px-2">
        <p
          v-if="pages.progress && query"
          class="text-caption text-medium-emphasis px-4 pb-2"
          data-testid="search-progress"
        >
          Still fetching pages ({{ pages.progress.done }} of {{ pages.progress.total }}). Some text
          may not be found yet.
        </p>

        <template v-if="query === ''">
          <v-list v-if="recent.length > 0" density="compact" data-testid="search-recent">
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
              <v-icon :icon="iconFor(result.item)" :color="colorFor(result.item)" />
            </template>
            <div class="search-result__head">
              <HighlightedText
                class="search-result__name text-subtitle-2"
                :text="result.item.name"
                :matches="findMatches(result.item.name, term)"
              />
              <span
                v-if="result.matchCount > 0"
                class="text-caption text-primary"
                data-testid="search-match-count"
              >
                {{ plural(result.matchCount, 'match', 'matches') }}
              </span>
            </div>
            <div class="search-result__meta text-caption text-medium-emphasis">
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
              <div v-if="excerpt.heading" class="search-result__heading text-caption">
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
          class="text-caption text-medium-emphasis px-4"
          data-testid="search-limited"
        >
          Showing the best {{ results.length }} of {{ found.total }} results. Add a word to narrow
          them down.
        </p>
      </v-card-text>
      <v-card-actions v-if="$vuetify.display.xs">
        <v-spacer />
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.search-result__head,
.search-result__meta {
  display: flex;
  gap: 8px;
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
  border-radius: 4px;
  padding: 4px 6px;
  font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
