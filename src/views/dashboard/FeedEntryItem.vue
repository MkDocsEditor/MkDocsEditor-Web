<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

import type { FeedEntry } from '@/api'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { formatDate, formatWhen } from '@/services/time'

import { detailsOf, headingsText, peopleText, verbOf } from './feedText'

/** One change of the feed: who did what to which page, when, and where in it. */
defineProps<{
  entry: FeedEntry
  /** The page's name, as the tree shows it. */
  name: string
  to?: RouteLocationRaw
  /** One of the edits of a group, shown under it. */
  nested?: boolean
}>()
</script>

<template>
  <v-list-item :to="to" :class="{ 'feed-entry--nested': nested }" data-testid="feed-entry">
    <template #prepend>
      <v-avatar-group class="me-4 feed-entry__authors">
        <UserAvatar
          v-for="author in entry.authors.slice(0, 3)"
          :key="author.accountId ?? author.displayName"
          :name="author.displayName"
          :color="author.color"
          :account-id="author.accountId"
          :avatar="author.avatar"
          :size="nested ? 24 : 32"
          class="text-body-small"
        />
      </v-avatar-group>
    </template>
    <v-list-item-title class="text-wrap">
      {{ peopleText(entry.authors) }} {{ verbOf(entry) }}
      <strong v-if="!nested">{{ name }}</strong>
    </v-list-item-title>
    <v-list-item-subtitle class="text-wrap">
      <template v-if="!nested">{{ detailsOf(entry) }}</template>
      <template v-if="entry.summary?.linesAdded || entry.summary?.linesRemoved">
        <template v-if="!nested">·</template>
        <!-- a count of zero is left out: "+4", "−2" or "+4 −2" -->
        <span v-if="entry.summary.linesAdded" class="feed-entry__added" data-testid="feed-added"
          >+{{ entry.summary.linesAdded }}</span
        >
        <span
          v-if="entry.summary.linesRemoved"
          class="feed-entry__removed"
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
</template>

<style scoped>
/* added and removed lines as the diff views show them (the code palette, as on Android) */
.feed-entry__added {
  color: rgb(var(--v-theme-code-inserted));
  font-weight: 500;
}
.feed-entry__removed {
  color: rgb(var(--v-theme-code-deleted));
  font-weight: 500;
}
/* under the row of its group, which names the page */
.feed-entry--nested {
  padding-inline-start: calc(var(--app-space-4) * 3);
}
</style>
