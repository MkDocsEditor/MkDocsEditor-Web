<script setup lang="ts">
import { mdiRobotOutline } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'

import { useAuthApi } from '@/api'
import type { AppTokenScope, CreatedAppToken } from '@/api'
import CopyField from '@/components/auth/CopyField.vue'
import CodeSnippet from '@/components/common/CodeSnippet.vue'
import { getConfig } from '@/config'
import {
  claudeCommand,
  curlEdit,
  curlRead,
  defaultAgentName,
  mcpAvailable,
  mcpJson,
  mcpUrl,
} from '@/services/agentSnippets'
import { EXPIRY_CHOICES, SCOPE_CHOICES, tokenNameRule } from '@/services/appTokens'
import { useNotifyStore } from '@/stores/notify'
import { ReauthCancelled, useReauthStore } from '@/stores/reauth'

/**
 * "Connect an AI agent": creates an app token and shows how to give it to Claude Code, other
 * MCP clients or a script, with the address of this server filled in.
 */
const emit = defineEmits<{ created: [] }>()

const api = useAuthApi()
const notify = useNotifyStore()
const reauth = useReauthStore()

const backendUrl = getConfig().backendUrl
const url = mcpUrl(backendUrl)

const name = ref(defaultAgentName(navigator.userAgent))
const scope = ref<AppTokenScope>('write')
const expiresInDays = ref<number | null>(90)
const busy = ref(false)
const created = ref<CreatedAppToken | null>(null)
const tab = ref('claude')
/** False: the backend has no MCP server yet; null: unknown. */
const mcpLive = ref<boolean | null>(null)
/** The server signs MCP clients in with OAuth: then no token needs copying. */
const oauth = ref(false)

const token = computed(() => created.value?.token ?? '')

async function create(): Promise<void> {
  const trimmed = name.value.trim()
  if (tokenNameRule(trimmed) !== true) return
  busy.value = true
  try {
    created.value = await reauth.run(() =>
      api.createAppToken({
        name: trimmed,
        scope: scope.value,
        ...(expiresInDays.value ? { expiresInDays: expiresInDays.value } : {}),
      }),
    )
    emit('created')
  } catch (e) {
    if (!(e instanceof ReauthCancelled)) notify.error(e)
  } finally {
    busy.value = false
  }
}

function reset(): void {
  created.value = null
  name.value = defaultAgentName(navigator.userAgent)
  tab.value = 'claude'
}

onMounted(async () => {
  void api
    .serverInfo()
    .then((info) => (oauth.value = info.features?.includes('oauth') === true))
    .catch(() => undefined)
  mcpLive.value = await mcpAvailable(url)
})
</script>

<template>
  <v-card data-testid="connect-agent">
    <v-card-item :prepend-icon="mdiRobotOutline">
      <v-card-title>Connect an AI agent</v-card-title>
      <v-card-subtitle>Claude Code, Cursor and other MCP clients</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-alert
        v-if="mcpLive === false"
        type="info"
        variant="tonal"
        class="mb-4"
        data-testid="mcp-not-live"
      >
        This server does not offer MCP yet. The token and the REST API work already; the MCP setup
        works once the server is updated.
      </v-alert>

      <div v-if="oauth && !created" class="mb-6" data-testid="connect-agent-oauth">
        <p class="mb-2">
          For Claude Code, run this in a terminal, then in Claude Code <code>/mcp</code> and
          “Authenticate”:
        </p>
        <CodeSnippet
          :code="claudeCommand(url, undefined, true)"
          label="Command"
          testid="snippet-claude-oauth"
        />
        <p class="mt-2 text-medium-emphasis">
          The browser opens to sign in and allow it; no token to copy. Other clients with OAuth
          (Claude Desktop, Cursor, …) need only the address <code>{{ url }}</code
          >.
        </p>
        <v-divider class="my-4" />
        <p class="text-title-small">For clients without OAuth: a token</p>
      </div>

      <v-form v-if="!created" data-testid="connect-agent-form" @submit.prevent="create">
        <p class="mb-4">
          Creates an app token for the agent. The agent acts as you: its edits show your name.
        </p>
        <div class="d-flex flex-column ga-2">
          <v-text-field
            v-model="name"
            label="Name"
            hint="Shows where the agent edited, and in the list of tokens"
            persistent-hint
            :rules="[tokenNameRule]"
            data-testid="connect-agent-name"
          />
          <v-radio-group v-model="scope" label="Access" hide-details inline>
            <v-radio
              v-for="choice in SCOPE_CHOICES"
              :key="choice.value"
              :value="choice.value"
              :label="choice.title"
            />
          </v-radio-group>
          <v-select
            v-model="expiresInDays"
            :items="EXPIRY_CHOICES"
            label="Expires"
            data-testid="connect-agent-expiry"
          />
        </div>
        <v-btn
          type="submit"
          color="primary"
          variant="flat"
          :prepend-icon="mdiRobotOutline"
          :loading="busy"
          :disabled="tokenNameRule(name) !== true"
          data-testid="connect-agent-create"
        >
          Create a token and show the setup
        </v-btn>
      </v-form>

      <template v-else>
        <v-alert type="success" variant="tonal" class="mb-4" data-testid="connect-agent-created">
          <strong>{{ created.appToken.name }}</strong> is ready. Copy the setup now: you won't see
          the token again.
        </v-alert>

        <v-tabs v-model="tab" class="mb-4" data-testid="connect-agent-tabs">
          <v-tab value="claude">Claude Code</v-tab>
          <v-tab value="mcp">Other MCP clients</v-tab>
          <v-tab value="rest">REST API</v-tab>
        </v-tabs>
        <v-window v-model="tab">
          <v-window-item value="claude" class="d-flex flex-column ga-2">
            <p>Run in a terminal, in the project where you want the wiki:</p>
            <CodeSnippet
              :code="claudeCommand(url, token)"
              label="Command for this project"
              testid="snippet-claude"
            />
            <p class="mt-2">Or for all your projects:</p>
            <CodeSnippet
              :code="claudeCommand(url, token, true)"
              label="Command for all projects"
              testid="snippet-claude-user"
            />
          </v-window-item>
          <v-window-item value="mcp" class="d-flex flex-column ga-2">
            <p>
              For Claude Desktop, Cursor and other clients: add this to their MCP configuration.
            </p>
            <CodeSnippet
              :code="mcpJson(url, token)"
              label="MCP configuration"
              testid="snippet-json"
            />
          </v-window-item>
          <v-window-item value="rest" class="d-flex flex-column ga-2">
            <p>
              Read a page. The document id is in the page's address, or use “Copy for an AI agent”
              in its menu:
            </p>
            <CodeSnippet
              :code="curlRead(backendUrl, token)"
              label="Read command"
              testid="snippet-curl-read"
            />
            <p class="mt-2">
              Replace text in it. Each <code>old</code> must occur exactly once, else the answer is
              409 <code>edit-not-found</code> or <code>edit-ambiguous</code> and nothing changes.
              Open editors show the change at once:
            </p>
            <CodeSnippet
              :code="curlEdit(backendUrl, token)"
              label="Edit command"
              testid="snippet-curl-edit"
            />
          </v-window-item>
        </v-window>

        <div class="mt-4">
          <CopyField :value="token" label="Token" testid="connect-agent-token" />
        </div>
        <p class="mt-4 text-medium-emphasis">
          Then ask the agent, for example: “Read the wiki page about the heating and add today's
          maintenance”. To point it at a page, use “Copy for an AI agent” in the page's menu.
        </p>
        <v-btn class="mt-4" data-testid="connect-agent-done" @click="reset">Done</v-btn>
      </template>
    </v-card-text>
  </v-card>
</template>
