<script setup lang="ts">
import { mdiCellphoneArrowDown } from '@mdi/js'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AuthCard from '@/components/auth/AuthCard.vue'
import CopyField from '@/components/auth/CopyField.vue'
import { formatTime } from '@/services/accountRules'
import {
  appUrlForPayload,
  connectUrlForPayload,
  decodeConnectPayload,
  OBTAINIUM_ADD_URL,
  OBTAINIUM_HOME,
} from '@/services/connectLink'

/**
 * Where a connect link lands when the Android app did not take it (not installed, or the
 * browser ignored the App Link). The payload stays in the fragment: this page sends no
 * requests, so it never reaches a server. It also stays in the address bar, so the page
 * still works after installing the app and coming back.
 */
const route = useRoute()

const raw = computed(() => route.hash.replace(/^#/, ''))
const decoded = computed(() => decodeConnectPayload(raw.value))
const payload = computed(() => (decoded.value.ok ? decoded.value.payload : null))
const expired = computed(
  () => payload.value !== null && Date.parse(payload.value.expiresAt) <= Date.now(),
)
const server = computed(() => {
  if (!payload.value) return ''
  try {
    return new URL(payload.value.backendUrl).host
  } catch {
    return payload.value.backendUrl
  }
})
</script>

<template>
  <AuthCard title="Connect the Android app" :max-width="520">
    <div data-testid="connect-page">
      <template v-if="payload">
        <p class="mb-4" data-testid="connect-info">
          This link signs the MkDocsEditor app in as <strong>{{ payload.username }}</strong> on
          <strong>{{ server }}</strong
          >.
          <template v-if="expired">
            It expired at {{ formatTime(payload.expiresAt) }}; create a new one on the account page.
          </template>
          <template v-else>It works once, until {{ formatTime(payload.expiresAt) }}.</template>
        </p>
        <v-btn
          v-if="!expired"
          color="primary"
          variant="flat"
          size="large"
          block
          class="mb-6"
          :href="appUrlForPayload(raw)"
          data-testid="connect-open-app"
        >
          Open in the app
        </v-btn>
      </template>
      <v-alert v-else type="info" variant="tonal" class="mb-4" data-testid="connect-invalid">
        <template v-if="decoded.ok === false && decoded.reason === 'version'">
          This link needs a newer version of the web client and the app.
        </template>
        <template v-else>
          This page opens connect links that the app did not take. Create a link on the account page
          of a signed-in browser (Account → Devices) and scan it with your phone.
        </template>
      </v-alert>

      <h2 class="text-subtitle-1 font-weight-bold mb-2">Don't have the app yet?</h2>
      <ol class="install-steps mb-4" data-testid="connect-install">
        <li>
          Install <a :href="OBTAINIUM_HOME" target="_blank" rel="noopener">Obtainium</a>. It
          installs apps from their GitHub releases and keeps them up to date.
        </li>
        <li>
          <a :href="OBTAINIUM_ADD_URL" target="_blank" rel="noopener"
            >Add MkDocsEditor to Obtainium</a
          >. Turn on “Include prereleases”, then install the app.
        </li>
        <li>Come back here and tap “Open in the app”, or scan the QR code again.</li>
      </ol>
      <v-btn
        variant="tonal"
        :prepend-icon="mdiCellphoneArrowDown"
        :href="OBTAINIUM_ADD_URL"
        target="_blank"
        rel="noopener"
        class="mb-6"
        data-testid="connect-obtainium"
      >
        Install with Obtainium
      </v-btn>

      <template v-if="payload && !expired">
        <h2 class="text-subtitle-1 font-weight-bold mb-2">The link</h2>
        <p class="mb-2 text-medium-emphasis">Paste it into the app if opening does not work.</p>
        <CopyField :value="connectUrlForPayload(raw)" label="Connect link" testid="connect-link" />
      </template>
    </div>
  </AuthCard>
</template>

<style scoped>
.install-steps {
  padding-left: 1.25rem;
}

.install-steps li {
  margin-bottom: 0.5rem;
}
</style>
