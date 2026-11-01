<script setup lang="ts">
import {
  mdiAccountCircle,
  mdiAccountCog,
  mdiLinkVariantOff,
  mdiLogout,
  mdiMagnify,
  mdiPaperclip,
  mdiPaperclipOff,
  mdiRefresh,
  mdiShieldAccount,
} from '@mdi/js'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import { ApiError } from '@/api'
import ReauthDialog from '@/components/auth/ReauthDialog.vue'
import NotificationHost from '@/components/common/NotificationHost.vue'
import MoveDialog from '@/components/move/MoveDialog.vue'
import { canDropInto, dragged, dropTarget } from '@/components/tree/dragState'
import NavTree from '@/components/tree/NavTree.vue'
import SearchDialog from '@/components/tree/SearchDialog.vue'
import { roleLabel } from '@/services/accountRules'
import { followMovedRoute } from '@/services/redirects'
import { useStored } from '@/services/storedRef'
import { useAuthStore } from '@/stores/auth'
import { useLiveStore } from '@/stores/live'
import { useMoveStore } from '@/stores/move'
import { describeError } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

const auth = useAuthStore()
const tree = useTreeStore()
const route = useRoute()
const router = useRouter()
const { mobile } = useDisplay()

const showShell = computed(() => auth.isLoggedIn && !route.meta.public)
/** The wiki needs a full session: a restricted one (2FA setup pending) only sees its account. */
const showWiki = computed(() => showShell.value && !auth.secondFactorSetupRequired)
const drawer = ref<boolean | null>(null)
const searchOpen = ref(false)
const opened = reactive(new Set<string>())

/** Files (resources) in the drawer tree; can be hidden in large wikis. */
const showFiles = useStored('mkdocseditor.treeShowFiles', true)

const activeId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : tree.root?.id,
)

// Open the drawer tree along the path to the current item.
watch(
  [activeId, () => tree.root],
  ([id]) => {
    if (!id) return
    for (const section of tree.ancestors(id)) opened.add(section.id)
    // a folder that is open on the page is expanded in the tree too
    if (tree.section(id)) opened.add(id)
  },
  { immediate: true },
)

function toggle(id: string): void {
  if (opened.has(id)) opened.delete(id)
  else opened.add(id)
}

async function loadTree(): Promise<void> {
  try {
    await tree.load()
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) auth.endSession()
  }
}

// Live updates (tree changes, who is editing what) while logged in.
const live = useLiveStore()
watch(
  showWiki,
  (show) => {
    if (show && !tree.root) void loadTree()
    if (show) live.start({ onUnauthorized: () => auth.endSession() })
    else live.stop()
  },
  { immediate: true },
)
onBeforeUnmount(() => live.stop())

const stopFollowing = live.onItemsMoved((moves) => followMovedRoute(router, moves))
// expanded folders keep their state under their new ids
const stopRekeying = live.onItemsMoved((moves) => {
  for (const m of moves) {
    if (m.type === 'section' && opened.delete(m.oldId)) opened.add(m.newId)
  }
})
onBeforeUnmount(() => {
  stopFollowing()
  stopRekeying()
})

// Dropping a tree item on "Wiki" moves it to the top folder.
const moveStore = useMoveStore()
function onRootDragOver(event: DragEvent): void {
  if (!tree.root || !canDropInto(tree, dragged.value, tree.root.id)) return
  event.preventDefault()
  dropTarget.value = tree.root.id
}
function onRootDrop(event: DragEvent): void {
  const item = dragged.value
  dragged.value = null
  dropTarget.value = null
  if (!tree.root || !canDropInto(tree, item, tree.root.id)) return
  event.preventDefault()
  moveStore.open(item, tree.root.id)
}

let loggingOut = false

// The session ended (expired, revoked elsewhere, account disabled): back to the login, then
// back here. Unsaved edits stay in the offline store and sync after the next sign-in.
watch(
  () => auth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) return
    live.stop()
    tree.reset()
    if (!route.meta.public && !loggingOut) {
      void router.push({ name: 'login', query: { redirect: route.fullPath } })
    }
  },
)

async function logout(): Promise<void> {
  loggingOut = true
  live.stop()
  try {
    await auth.logout()
    tree.reset()
    await router.push({ name: 'login' })
  } finally {
    loggingOut = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  // the editor uses Ctrl+K for links
  if (event.defaultPrevented) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && showWiki.value) {
    event.preventDefault()
    searchOpen.value = true
  }
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <v-app>
    <v-app-bar color="primary-container" density="comfortable" flat class="app-bar">
      <template v-if="showWiki" #prepend>
        <v-app-bar-nav-icon aria-label="Menu" @click="drawer = !drawer" />
      </template>
      <v-app-bar-title>
        <router-link :to="{ name: 'home' }" class="app-title">
          <img src="/logo.png" alt="" width="28" height="28" class="app-logo" />
          MkDocsEditor
        </router-link>
      </v-app-bar-title>
      <template v-if="showShell" #append>
        <v-btn
          v-if="showWiki"
          :icon="mdiMagnify"
          aria-label="Search"
          data-testid="search-button"
          @click="searchOpen = true"
        />
        <v-menu v-if="!auth.anonymous">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              :icon="mdiAccountCircle"
              aria-label="Account"
              data-testid="account-menu"
            />
          </template>
          <v-list density="compact">
            <v-list-item
              :title="auth.displayName || auth.username"
              :subtitle="auth.role ? `signed in (${roleLabel(auth.role)})` : 'signed in'"
            />
            <v-divider />
            <v-list-item
              :prepend-icon="mdiAccountCog"
              title="Account"
              :to="{ name: 'account' }"
              data-testid="menu-account"
            />
            <v-list-item
              :prepend-icon="mdiLinkVariantOff"
              title="Broken links and unused files"
              :to="{ name: 'references' }"
              data-testid="menu-references"
            />
            <v-list-item
              v-if="auth.isAdmin"
              :prepend-icon="mdiShieldAccount"
              title="Admin"
              :to="{ name: 'admin' }"
              data-testid="menu-admin"
            />
            <v-list-item
              :prepend-icon="mdiLogout"
              title="Sign out"
              data-testid="menu-logout"
              @click="logout"
            />
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>

    <v-navigation-drawer
      v-if="showWiki"
      v-model="drawer"
      :temporary="mobile"
      width="300"
      data-testid="nav-drawer"
    >
      <v-list nav density="compact" class="py-1">
        <v-list-item
          :to="{ name: 'home' }"
          :active="activeId === tree.root?.id"
          title="Wiki"
          class="font-weight-bold"
          :class="{ 'app-tree__drop': tree.root && dropTarget === tree.root.id }"
          data-testid="tree-root"
          @click="mobile && (drawer = false)"
          @dragover="onRootDragOver"
          @dragleave="dropTarget = null"
          @drop="onRootDrop"
        >
          <template #append>
            <v-btn
              :icon="showFiles ? mdiPaperclip : mdiPaperclipOff"
              variant="text"
              size="x-small"
              :aria-label="showFiles ? 'Hide files' : 'Show files'"
              :title="showFiles ? 'Hide files' : 'Show files'"
              :aria-pressed="showFiles"
              data-testid="tree-toggle-files"
              @click.stop.prevent="showFiles = !showFiles"
            />
          </template>
        </v-list-item>
        <NavTree
          v-if="tree.root"
          :section="tree.root"
          :depth="0"
          :active-id="activeId"
          :opened="opened"
          :show-files="showFiles"
          @toggle="toggle"
          @navigate="mobile && (drawer = false)"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-progress-linear v-if="tree.loading" indeterminate color="secondary" absolute />
      <v-alert
        v-if="showWiki && tree.error && !tree.root && !route.meta.standalone"
        type="error"
        variant="tonal"
        class="ma-4"
        :text="describeError(tree.error)"
      >
        <template #append>
          <v-btn :prepend-icon="mdiRefresh" variant="text" @click="loadTree">Retry</v-btn>
        </template>
      </v-alert>
      <router-view v-if="!showWiki || tree.root || route.meta.standalone" />
    </v-main>

    <SearchDialog v-if="showWiki" v-model="searchOpen" />
    <MoveDialog v-if="showWiki" />
    <ReauthDialog v-if="showShell" />
    <NotificationHost />
  </v-app>
</template>

<style scoped>
.app-tree__drop {
  outline: 2px dashed rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
/* Like the Android app's top bar: primary container, title and icons in on-surface. */
.app-bar {
  color: rgb(var(--v-theme-on-surface)) !important;
}

.app-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}

.app-logo {
  flex: none;
}
</style>
