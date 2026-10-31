<script setup lang="ts">
import { mdiAccountCircle, mdiLogout, mdiMagnify, mdiRefresh } from '@mdi/js'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import { ApiError } from '@/api'
import NotificationHost from '@/components/common/NotificationHost.vue'
import NavTree from '@/components/tree/NavTree.vue'
import SearchDialog from '@/components/tree/SearchDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useLiveStore } from '@/stores/live'
import { describeError } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

const auth = useAuthStore()
const tree = useTreeStore()
const route = useRoute()
const router = useRouter()
const { mobile } = useDisplay()

const showShell = computed(() => auth.isLoggedIn && !route.meta.public)
const drawer = ref<boolean | null>(null)
const searchOpen = ref(false)
const opened = reactive(new Set<string>())

const activeId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : tree.root?.id,
)

// Open the drawer tree along the path to the current item.
watch(
  [activeId, () => tree.root],
  ([id]) => {
    if (id) for (const section of tree.ancestors(id)) opened.add(section.id)
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
    if (error instanceof ApiError && error.isUnauthorized) await logout()
  }
}

// Live updates (tree changes, who is editing what) while logged in.
const live = useLiveStore()
watch(
  showShell,
  (show) => {
    if (show && !tree.root) void loadTree()
    if (show) live.start({ onUnauthorized: () => void logout() })
    else live.stop()
  },
  { immediate: true },
)
onBeforeUnmount(() => live.stop())

async function logout(): Promise<void> {
  live.stop()
  auth.logout()
  tree.reset()
  await router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && showShell.value) {
    event.preventDefault()
    searchOpen.value = true
  }
}
window.addEventListener('keydown', onKeydown)
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <template v-if="showShell" #prepend>
        <v-app-bar-nav-icon aria-label="Menu" @click="drawer = !drawer" />
      </template>
      <v-app-bar-title>
        <router-link :to="{ name: 'home' }" class="app-title">MkDocsEditor</router-link>
      </v-app-bar-title>
      <template v-if="showShell" #append>
        <v-btn
          :icon="mdiMagnify"
          aria-label="Search"
          data-testid="search-button"
          @click="searchOpen = true"
        />
        <v-menu v-if="!auth.anonymous">
          <template #activator="{ props }">
            <v-btn v-bind="props" :icon="mdiAccountCircle" aria-label="Account" />
          </template>
          <v-list density="compact">
            <v-list-item
              :title="auth.displayName || auth.username"
              :subtitle="auth.role ? `signed in (${auth.role})` : 'signed in'"
            />
            <v-divider />
            <v-list-item :prepend-icon="mdiLogout" title="Sign out" @click="logout" />
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>

    <v-navigation-drawer
      v-if="showShell"
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
          @click="mobile && (drawer = false)"
        />
        <NavTree
          v-if="tree.root"
          :section="tree.root"
          :depth="0"
          :active-id="activeId"
          :opened="opened"
          @toggle="toggle"
          @navigate="mobile && (drawer = false)"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-progress-linear v-if="tree.loading" indeterminate color="secondary" absolute />
      <v-alert
        v-if="showShell && tree.error && !tree.root"
        type="error"
        variant="tonal"
        class="ma-4"
        :text="describeError(tree.error)"
      >
        <template #append>
          <v-btn :prepend-icon="mdiRefresh" variant="text" @click="loadTree">Retry</v-btn>
        </template>
      </v-alert>
      <router-view v-if="!showShell || tree.root" />
    </v-main>

    <SearchDialog v-if="showShell" v-model="searchOpen" />
    <NotificationHost />
  </v-app>
</template>

<style scoped>
.app-title {
  color: inherit;
  text-decoration: none;
}
</style>
