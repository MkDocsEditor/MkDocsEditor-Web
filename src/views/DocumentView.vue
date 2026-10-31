<script setup lang="ts">
import {
  mdiAccountEdit,
  mdiCloudCheckOutline,
  mdiCloudOffOutline,
  mdiCloudSyncOutline,
  mdiDotsVertical,
  mdiEyeOutline,
  mdiFileDocumentEditOutline,
  mdiLockOutline,
  mdiOpenInNew,
  mdiViewSplitVertical,
} from '@mdi/js'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useDisplay } from 'vuetify'

import ItemBreadcrumbs from '@/components/tree/ItemBreadcrumbs.vue'
import MarkdownEditor from '@/editor/MarkdownEditor.vue'
import MarkdownPreview from '@/markdown/MarkdownPreview.vue'
import { local, readJson, writeJson } from '@/services/storage'
import { wikiPageUrl } from '@/services/wiki'
import { useTreeStore } from '@/stores/tree'
import { createDocumentSession } from '@/sync'
import type { DocumentSession } from '@/sync'

const props = defineProps<{ id: string }>()

const tree = useTreeStore()
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

const session = shallowRef<DocumentSession | null>(null)
const text = ref('')
const ready = ref(false)
const topLine = ref(0)

watch(
  () => props.id,
  (id) => {
    session.value?.close()
    const next = createDocumentSession(id)
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
        ? { icon: mdiCloudSyncOutline, color: 'info', text: 'Speichert …' }
        : { icon: mdiCloudCheckOutline, color: 'success', text: 'Gespeichert' }
    case 'connecting':
      return { icon: mdiCloudSyncOutline, color: 'info', text: 'Verbinde …' }
    case 'offline':
      return {
        icon: mdiCloudOffOutline,
        color: 'warning',
        text: s.unsynced ? 'Offline – Änderungen bleiben hier' : 'Offline',
      }
    case 'snapshot':
      return { icon: mdiLockOutline, color: 'default', text: 'Nur lesen' }
    case 'closed':
      return { icon: mdiCloudOffOutline, color: 'error', text: 'Getrennt' }
  }
  return null
})

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
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
          <v-btn value="edit" :icon="mdiFileDocumentEditOutline" aria-label="Bearbeiten" />
          <v-btn
            v-if="!mobile"
            value="split"
            :icon="mdiViewSplitVertical"
            aria-label="Bearbeiten und Vorschau"
          />
          <v-btn value="preview" :icon="mdiEyeOutline" aria-label="Vorschau" />
        </v-btn-toggle>

        <v-menu>
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" :icon="mdiDotsVertical" variant="text" aria-label="Mehr" />
          </template>
          <v-list density="compact">
            <v-list-item
              :prepend-icon="mdiAccountEdit"
              :title="showAuthorship ? 'Autoren ausblenden' : 'Wer hat was geschrieben?'"
              :disabled="!session || session.authorship.value.length === 0"
              @click="showAuthorship = !showAuthorship"
            />
            <v-list-item
              v-if="wikiUrl"
              :prepend-icon="mdiOpenInNew"
              title="Im Wiki ansehen"
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

    <div v-if="session" class="document-view__panes" :class="`document-view__panes--${mode}`">
      <div v-show="mode !== 'preview'" class="document-view__pane">
        <v-skeleton-loader v-if="!ready" type="paragraph@3" class="pa-4" />
        <MarkdownEditor
          v-else
          :key="id"
          :session="session"
          :show-authorship="showAuthorship"
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
</style>
