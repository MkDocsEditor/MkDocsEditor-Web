<script setup lang="ts">
import { mdiAccount, mdiOpenInNew, mdiSourceRepository } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, useAuthApi } from '@/api'
import type { GitRemoteStatus } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadError from '@/components/common/LoadError.vue'
import { useLoad } from '@/composables/useLoad'
import {
  adminRiskText,
  connectErrorText,
  connectResultOf,
  daysUntilExpiry,
  expiresSoon,
  providerName,
  pushUser,
  withoutConnectResult,
} from '@/services/gitRemote'
import type { ConnectResult } from '@/services/gitRemote'
import { plural } from '@/services/names'
import { formatTime, formatWhen } from '@/services/time'
import { useNotifyStore } from '@/stores/notify'
import { useReauthStore } from '@/stores/reauth'

const api = useAuthApi()
const reauth = useReauthStore()
const notify = useNotifyStore()
const route = useRoute()
const router = useRouter()

const status = ref<GitRemoteStatus | null>(null)
/** The server has no such endpoint yet: the card stays hidden. */
const unsupported = ref(false)
const busy = ref(false)
const confirmDisconnect = ref(false)
/** A failed attempt, from the query of the callback; shown until closed. */
const failed = ref<ConnectResult | null>(null)

const { loading, loadError, load } = useLoad({
  failure: 'Could not load the push connection',
  hasData: () => status.value !== null,
  fetch: async () => {
    try {
      status.value = await api.gitRemote()
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) unsupported.value = true
      else throw e
    }
  },
})

const linked = computed(() => {
  const state = status.value?.state
  return state === 'connected' || state === 'expired' || state === 'error'
})
const canConnect = computed(() => {
  const state = status.value?.state
  return state === 'disconnected' || state === 'expired'
})
const failedText = computed(() =>
  failed.value && status.value ? connectErrorText(failed.value, status.value) : null,
)
const grants = computed(() => status.value?.grantsUrl ?? null)
/** "Forgejo", or a neutral word without a provider. */
const name = computed(() => (status.value ? providerName(status.value) : 'the git host'))
const title = computed(() =>
  status.value?.providerName ? `Pushing to ${status.value.providerName}` : 'Pushing changes',
)
const host = computed(() => {
  const url = status.value?.providerUrl
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
})
const expiry = computed(() => {
  const s = status.value
  if (!s || !expiresSoon(s)) return null
  const days = daysUntilExpiry(s) ?? 0
  return days === 0 ? 'today' : `in ${plural(days, 'day')}`
})
const pending = computed(() => status.value?.pendingCommits ?? 0)

/** Reads and removes the result of the callback, so a reload does not show it again. */
async function takeConnectResult(): Promise<void> {
  const result = connectResultOf(route.query)
  if (!result) return
  if (result.ok) notify.success(`Connected to ${name.value}`)
  else failed.value = result
  await router.replace({ query: withoutConnectResult(route.query) as Record<string, string> })
}

async function connect(): Promise<void> {
  busy.value = true
  try {
    const { authorizeUrl } = await reauth.run(() => api.connectGitRemote())
    const url = new URL(authorizeUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unexpected address')
    window.location.assign(url.href)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      notify.error(
        `The server's push remote is no https address on ${host.value || name.value}. Fix the remote of the wiki's clone first.`,
      )
    } else {
      notify.error(e, `Could not connect to ${name.value}`)
    }
    busy.value = false
  }
}

async function disconnect(): Promise<void> {
  busy.value = true
  const url = grants.value
  try {
    status.value = await reauth.run(() => api.disconnectGitRemote())
    failed.value = null
    if (url) {
      notify.withAction(
        `Disconnected. Remove the app in ${name.value} too.`,
        `Open ${name.value}`,
        () => window.open(url, '_blank', 'noopener'),
      )
    } else {
      notify.success('Disconnected')
    }
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await load()
  await takeConnectResult()
})
</script>

<template>
  <v-card v-if="!unsupported" data-testid="git-remote">
    <v-card-item>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-subtitle>Where the server pushes the wiki</v-card-subtitle>
    </v-card-item>
    <v-progress-linear v-if="loading" indeterminate />
    <v-card-text v-else-if="loadError">
      <LoadError title="Could not load the push connection" :error="loadError" @retry="load" />
    </v-card-text>
    <template v-else-if="status">
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert
          v-if="failedText"
          type="error"
          closable
          data-testid="git-remote-failed"
          @click:close="failed = null"
        >
          {{ failedText.text }}
          <template v-if="failedText.grantLeft && grants">
            Then remove the app from that account under
            <a :href="grants" target="_blank" rel="noopener">its approved apps</a> in {{ name }}.
          </template>
        </v-alert>

        <v-alert
          v-if="status.state === 'not-configured'"
          type="info"
          data-testid="git-remote-not-configured"
        >
          Pushing is not set up on this server. Add <code>git.oauth</code> to the server
          configuration to connect a git host.
        </v-alert>
        <template v-else>
          <v-alert v-if="!status.pushEnabled" type="info" data-testid="git-remote-push-off">
            Pushing is off in the server configuration (<code>git.push</code>). You can connect
            already; the server pushes once it is switched on.
          </v-alert>

          <v-alert v-if="status.state === 'expired'" type="error" data-testid="git-remote-expired">
            The connection has ended: {{ name }} no longer accepts it.
            <template v-if="status.lastRefreshAt">
              It was last renewed {{ formatTime(status.lastRefreshAt) }}.
            </template>
            Connect again so the server can push.
          </v-alert>
          <v-alert
            v-else-if="status.lastRefreshError && !status.lastRefreshError.permanent"
            type="info"
            data-testid="git-remote-refresh-error"
          >
            Renewing the connection failed {{ formatWhen(status.lastRefreshError.at) }}:
            {{ status.lastRefreshError.message }}. The server tries again.
          </v-alert>
          <v-alert v-if="expiry" type="warning" data-testid="git-remote-expires">
            The connection ends {{ expiry }} unless the server can reach {{ name }} before.
          </v-alert>
          <v-alert
            v-if="linked && status.remoteUser?.isAdmin"
            type="warning"
            data-testid="git-remote-admin"
          >
            {{ status.remoteUser.login }} is an admin on {{ name }}.
            {{ adminRiskText(status) }} Connect a user that may only push to
            {{ status.repo ?? 'the repository' }}.
          </v-alert>
          <v-alert
            v-if="linked && status.remoteUser && status.canPush === false"
            type="error"
            data-testid="git-remote-cannot-push"
          >
            {{ status.remoteUser.login }} may not push to {{ status.repo ?? 'the repository' }}.
            Give the user write access in {{ name }}.
          </v-alert>
          <v-alert v-if="status.lastPushError" type="warning" data-testid="git-remote-push-error">
            The last push failed {{ formatWhen(status.lastPushError.at) }}:
            {{ status.lastPushError.message }}
          </v-alert>

          <v-list v-if="linked" lines="two" class="pa-0" data-testid="git-remote-details">
            <v-list-item
              :title="status.remoteUser?.login ?? 'Unknown user'"
              :prepend-avatar="status.remoteUser?.avatarUrl ?? undefined"
              :prepend-icon="status.remoteUser?.avatarUrl ? undefined : mdiAccount"
              :subtitle="`Connected ${formatTime(status.connectedAt)}${status.connectedBy ? ` by ${status.connectedBy}` : ''}`"
            />
            <v-list-item :prepend-icon="mdiSourceRepository" :title="status.repo ?? 'Repository'">
              <v-list-item-subtitle>
                {{ status.lastPushAt ? `Last push ${formatWhen(status.lastPushAt)}` : 'No push yet'
                }}<span v-if="pending > 0" data-testid="git-remote-pending">
                  · {{ plural(pending, 'change') }} waiting</span
                >
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
          <div v-if="linked && status.lastRefreshAt" class="text-medium-emphasis">
            Last renewed {{ formatWhen(status.lastRefreshAt) }}. The server renews the connection
            every day; unused for 30 days, it ends.
          </div>

          <div v-if="status.state === 'disconnected'" data-testid="git-remote-disconnected">
            Not connected. The server commits the changes but does not push them.
          </div>
          <div v-if="canConnect" class="text-medium-emphasis" data-testid="git-remote-hint">
            {{ status.providerName ?? 'The git host'
            }}<template v-if="host"> at {{ host }}</template>
            asks for the approval as whoever is signed in there. If that is not
            {{ pushUser(status) }}, sign out there first, or do this whole step in a private window.
          </div>
        </template>
      </v-card-text>
      <v-card-actions v-if="linked || canConnect" class="flex-wrap">
        <v-btn
          v-if="grants && linked"
          :href="grants"
          target="_blank"
          rel="noopener"
          :append-icon="mdiOpenInNew"
        >
          Apps in {{ name }}
        </v-btn>
        <v-spacer />
        <v-btn
          v-if="linked"
          color="error"
          :disabled="busy"
          data-testid="git-remote-disconnect"
          @click="confirmDisconnect = true"
        >
          Disconnect
        </v-btn>
        <v-btn
          v-if="canConnect"
          color="primary"
          variant="flat"
          :loading="busy"
          data-testid="git-remote-connect"
          @click="connect"
        >
          {{ status.state === 'expired' ? 'Connect again' : `Connect ${name}` }}
        </v-btn>
      </v-card-actions>
    </template>

    <ConfirmDialog
      v-model="confirmDisconnect"
      :title="`Disconnect ${name}?`"
      :text="`The server stops pushing until someone connects again. ${status?.providerName ?? 'The git host'} keeps the approval: remove the app there too.`"
      confirm-text="Disconnect"
      danger
      @confirm="disconnect"
    />
  </v-card>
</template>
