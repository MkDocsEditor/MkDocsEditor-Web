<script setup lang="ts">
import {
  mdiAccountCircle,
  mdiCogOutline,
  mdiLinkVariantOff,
  mdiQrcode,
  mdiRobotOutline,
  mdiLogout,
  mdiPaperclip,
  mdiPaperclipOff,
  mdiRefresh,
  mdiShieldAccount,
} from '@mdi/js'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay, useTheme } from 'vuetify'

import { ApiError } from '@/api'
import { showFilesInTree as showFiles, startPage, themeChoice } from '@/composables/preferences'
import ReauthDialog from '@/components/auth/ReauthDialog.vue'
import NotificationHost from '@/components/common/NotificationHost.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import TransferIndicator from '@/components/common/TransferIndicator.vue'
import MoveDialog from '@/components/move/MoveDialog.vue'
import DeleteDialogs from '@/components/tree/DeleteDialogs.vue'
import { canDropInto, dragged, dropTarget } from '@/components/tree/dragState'
import NavTree from '@/components/tree/NavTree.vue'
import SearchBar from '@/components/tree/SearchBar.vue'
import SearchDialog from '@/components/tree/SearchDialog.vue'
import { signOut } from '@/stores/signOut'
import { roleLabel } from '@/services/accountRules'
import { followMovedRoute } from '@/composables/useMovedRedirect'
import { useAuthStore } from '@/stores/auth'
import { useLiveStore } from '@/stores/live'
import { usePagesStore } from '@/stores/pages'
import { usePinsStore } from '@/stores/pins'
import { useQrStore } from '@/stores/qr'
import { useMoveStore } from '@/stores/move'
import { describeError, useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

const auth = useAuthStore()
const qr = useQrStore()
// the menu has "QR codes" on a server with them
watch(
  () => auth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) void qr.checkAvailable()
  },
  { immediate: true },
)
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

// light, dark or like the system: a setting of this browser
const theme = useTheme()
watch(themeChoice, (choice) => theme.change(choice), { immediate: true })

const activeId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : tree.root?.id,
)

/** The files of the top folder are open: on `/files`, or on `/` without "What's going on". */
const rootActive = computed(
  () => route.name === 'files' || (route.name === 'home' && startPage.value === 'files'),
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

// The text of all pages for search, kept up to date whenever the tree was loaded.
const pages = usePagesStore()
watch(
  () => tree.root,
  (root) => {
    if (root) void pages.sync()
  },
)
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

/** Access requests that wait for this admin: a badge, and a message when there are more. */
const pendingRequests = computed(() => (auth.isAdmin ? live.pendingAccessRequests : 0))
watch(pendingRequests, (pending, before) => {
  if (pending <= before) return
  if (route.name === 'settings' && route.params.section === 'requests') return
  useNotifyStore().withAction(
    pending === 1 ? 'Someone asks for access.' : `${pending} access requests are waiting.`,
    'Show',
    () => void router.push({ name: 'settings', params: { section: 'requests' } }),
  )
})

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
    pages.reset()
    usePinsStore().reset()
    useQrStore().reset()
    if (!route.meta.public && !loggingOut) {
      void router.push({ name: 'login', query: { redirect: route.fullPath } })
    }
  },
)

async function logout(): Promise<void> {
  loggingOut = true
  live.stop()
  try {
    await signOut()
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
    <v-app-bar color="primary-container" class="app-bar">
      <template v-if="showWiki" #prepend>
        <v-app-bar-nav-icon aria-label="Menu" @click="drawer = !drawer" />
      </template>
      <v-app-bar-title>
        <router-link :to="{ name: 'home' }" class="app-title">
          <img src="/logo.png" alt="" width="28" height="28" class="app-logo" />
          MkDocsEditor
        </router-link>
      </v-app-bar-title>
      <SearchBar v-if="showShell && showWiki" @open="searchOpen = true" />
      <template v-if="showShell" #append>
        <v-menu v-if="!auth.anonymous">
          <template #activator="{ props }">
            <v-badge
              :model-value="pendingRequests > 0"
              :content="pendingRequests"
              color="error"
              offset-x="8"
              offset-y="8"
              data-testid="access-requests-badge"
            >
              <v-btn v-bind="props" icon aria-label="Account" data-testid="account-menu">
                <UserAvatar
                  v-if="auth.user"
                  :name="auth.displayName || auth.username"
                  :color="auth.user.color || undefined"
                  :account-id="auth.user.id"
                  :avatar="auth.user.avatar"
                  size="32"
                  class="text-label-medium"
                />
                <v-icon v-else :icon="mdiAccountCircle" />
              </v-btn>
            </v-badge>
          </template>
          <v-list>
            <v-list-item
              :title="auth.displayName || auth.username"
              :subtitle="auth.role ? `signed in (${roleLabel(auth.role)})` : 'signed in'"
              :to="{ name: 'settings', params: { section: 'profile' } }"
              data-testid="menu-account"
            >
              <template v-if="auth.user" #prepend>
                <UserAvatar
                  :name="auth.displayName || auth.username"
                  :color="auth.user.color || undefined"
                  :account-id="auth.user.id"
                  :avatar="auth.user.avatar"
                  size="40"
                  class="mr-4 text-label-large"
                  data-testid="menu-avatar"
                />
              </template>
            </v-list-item>
            <v-divider />
            <v-list-item
              :prepend-icon="mdiCogOutline"
              title="Settings"
              :to="{ name: 'settings' }"
              data-testid="menu-settings"
            />
            <v-list-item
              v-if="auth.isAdmin"
              :prepend-icon="mdiShieldAccount"
              title="Administration"
              :to="{
                name: 'settings',
                params: { section: pendingRequests > 0 ? 'requests' : 'users' },
              }"
              data-testid="menu-admin"
            >
              <template v-if="pendingRequests > 0" #append>
                <v-badge inline color="error" :content="pendingRequests" />
              </template>
            </v-list-item>
            <v-list-item
              :prepend-icon="mdiRobotOutline"
              title="Connect an AI agent"
              :to="{ name: 'settings', params: { section: 'agents' } }"
              data-testid="menu-agents"
            />
            <v-list-item
              v-if="qr.available"
              :prepend-icon="mdiQrcode"
              title="QR codes"
              :to="{ name: 'qr-codes' }"
              data-testid="menu-qr-codes"
            />
            <v-list-item
              :prepend-icon="mdiLinkVariantOff"
              title="Broken links and unused files"
              :to="{ name: 'references' }"
              data-testid="menu-references"
            />
            <v-divider />
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
      <v-list nav class="py-1">
        <v-list-item
          :to="{ name: 'files' }"
          :active="rootActive"
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
      <v-progress-linear v-if="tree.loading" indeterminate absolute />
      <v-alert
        v-if="showWiki && tree.error && !tree.root && !route.meta.standalone"
        type="error"
        class="ma-4"
        :text="describeError(tree.error)"
      >
        <template #append>
          <v-btn :prepend-icon="mdiRefresh" @click="loadTree">Retry</v-btn>
        </template>
      </v-alert>
      <router-view v-if="!showWiki || tree.root || route.meta.standalone" />
    </v-main>

    <SearchDialog v-if="showWiki" v-model="searchOpen" />
    <MoveDialog v-if="showWiki" />
    <DeleteDialogs v-if="showWiki" />
    <ReauthDialog v-if="showShell" />
    <TransferIndicator />
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

/* a flex box, not inline: inline it sits on the text baseline, above the middle of the bar */
.app-title {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  color: inherit;
  text-decoration: none;
}

.app-logo {
  display: block;
  flex: none;
}
</style>
