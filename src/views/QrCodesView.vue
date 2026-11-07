<script setup lang="ts">
import { mdiAlertOutline, mdiPrinter, mdiQrcode } from '@mdi/js'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import QrCode from '@/components/auth/QrCode.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import LoadError from '@/components/common/LoadError.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageSelect from '@/components/pickers/PageSelect.vue'
import { formatDate, formatWhen } from '@/services/time'
import { useAuthStore } from '@/stores/auth'
import { useQrStore } from '@/stores/qr'

/**
 * All QR codes of the wiki: which page each opens and when it was scanned last, codes on more than
 * one page, invalid values, and codes whose page is gone (to put on another page). Codes are
 * added on their page; this is the place to find and print them.
 */
const qr = useQrStore()
qr.ensureLoaded()
const router = useRouter()
const auth = useAuthStore()
const canEdit = computed(() => auth.role === 'admin' || auth.role === 'editor')

const list = computed(() => qr.codes)
const selected = ref<string[]>([])
const allKeys = computed(() => list.value?.codes.map((c) => c.key) ?? [])
const problems = computed(
  () => (list.value?.conflicts.length ?? 0) + (list.value?.invalid.length ?? 0),
)

function printSheet(keys: string[]): void {
  void router.push({ name: 'qr-print', query: { key: keys } })
}

/** The key of a gone code that is being put on a page, with the chosen page. */
const assigning = ref<string | null>(null)
const page = ref<string | null>(null)
function assign(): void {
  if (assigning.value && page.value)
    void router.push({
      name: 'document',
      params: { id: page.value },
      query: { qr: assigning.value },
    })
}
</script>

<template>
  <v-container class="qr-codes-view pb-16">
    <PageHeader title="QR codes" testid="qr-codes-title">
      <template #icon><v-icon :icon="mdiQrcode" /></template>
    </PageHeader>
    <p class="text-body-medium text-medium-emphasis mb-4">
      A sticker with a QR code opens the page that has the code. Add codes on a page, with “QR
      codes” in its menu; the code moves with the page when it is renamed or moved.
    </p>

    <v-alert
      v-if="qr.available === false"
      type="info"
      variant="outlined"
      text="This server has no QR codes yet. Update the backend."
    />
    <LoadError
      v-else-if="qr.error && !list"
      title="The QR codes could not be loaded"
      :error="qr.error"
      @retry="qr.load()"
    />
    <v-progress-linear v-else-if="!list" indeterminate aria-label="Loading the QR codes" />
    <template v-else>
      <section class="mb-6">
        <div class="d-flex flex-wrap align-center ga-2 mb-2">
          <h2 class="text-title-medium">Codes</h2>
          <v-spacer />
          <v-btn
            variant="text"
            :prepend-icon="mdiPrinter"
            :disabled="selected.length === 0"
            data-testid="qr-print-selected"
            @click="printSheet(selected)"
          >
            Print selected
          </v-btn>
          <v-btn
            variant="outlined"
            :prepend-icon="mdiPrinter"
            :disabled="allKeys.length === 0"
            data-testid="qr-print-all"
            @click="printSheet(allKeys)"
          >
            Print all
          </v-btn>
        </div>
        <v-list
          v-if="list.codes.length > 0"
          v-model:selected="selected"
          select-strategy="leaf"
          lines="two"
          class="app-card-list py-0"
          data-testid="qr-codes"
        >
          <v-list-item
            v-for="code in list.codes"
            :key="code.key"
            :value="code.key"
            data-testid="qr-code-row"
          >
            <template #prepend="{ isSelected, select }">
              <v-checkbox-btn
                :model-value="isSelected"
                :aria-label="`Select ${code.key}`"
                @update:model-value="select"
              />
              <QrCode
                :value="qr.urlFor(code.key)"
                :label="`QR code ${code.key}`"
                :size="48"
                class="me-4"
              />
            </template>
            <v-list-item-title>
              <router-link
                class="qr-codes-view__link"
                :to="{ name: 'document', params: { id: code.item.id } }"
              >
                {{ code.title }}
              </router-link>
            </v-list-item-title>
            <v-list-item-subtitle>
              <code>{{ code.key }}</code>
              <template v-if="code.label"> · {{ code.label }}</template>
            </v-list-item-subtitle>
            <template #append>
              <span
                class="text-body-small text-medium-emphasis ms-2"
                :title="code.lastScannedAt ? formatDate(code.lastScannedAt) : undefined"
              >
                {{
                  code.lastScannedAt ? `Scanned ${formatWhen(code.lastScannedAt)}` : 'Never scanned'
                }}
              </span>
            </template>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-medium text-medium-emphasis">No page has a QR code yet.</p>
      </section>

      <section v-if="list.gone.length > 0" class="mb-6" data-testid="qr-gone">
        <h2 class="text-title-medium mb-1">Without a page</h2>
        <p class="text-body-medium text-medium-emphasis mb-2">
          Their page was deleted, or the code was removed from it. A sticker with one of these says
          so; put the code on a page to make it work again.
        </p>
        <v-list lines="two" class="app-card-list py-0">
          <v-list-item v-for="gone in list.gone" :key="gone.key" data-testid="qr-gone-row">
            <v-list-item-title>
              <code>{{ gone.key }}</code>
              <template v-if="gone.label"> · {{ gone.label }}</template>
            </v-list-item-title>
            <v-list-item-subtitle>
              Was on {{ gone.lastPath }}
              <template v-if="gone.lastScannedAt">
                · scanned {{ formatWhen(gone.lastScannedAt) }}
              </template>
            </v-list-item-subtitle>
            <template v-if="canEdit" #append>
              <v-btn
                variant="text"
                data-testid="qr-gone-assign"
                @click="((assigning = gone.key), (page = null))"
              >
                Put on a page…
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </section>

      <section v-if="problems > 0" class="mb-6" data-testid="qr-problems">
        <h2 class="text-title-medium mb-2">
          <v-icon :icon="mdiAlertOutline" color="error" size="small" class="me-1" />
          To fix
        </h2>
        <v-list lines="two" class="app-card-list py-0">
          <v-list-item
            v-for="conflict in list.conflicts"
            :key="`c-${conflict.key}`"
            data-testid="qr-conflict-row"
          >
            <v-list-item-title>
              <code>{{ conflict.key }}</code> is on {{ conflict.items.length }} pages
            </v-list-item-title>
            <v-list-item-subtitle class="text-wrap">
              A scan asks which one to open. Remove it from all but one:
              <template v-for="(choice, i) in conflict.items" :key="choice.item.id">
                <template v-if="i > 0">, </template>
                <router-link
                  class="qr-codes-view__link"
                  :to="{ name: 'document', params: { id: choice.item.id } }"
                >
                  {{ choice.title }}
                </router-link>
              </template>
            </v-list-item-subtitle>
          </v-list-item>
          <v-list-item
            v-for="invalid in list.invalid"
            :key="`i-${invalid.item.id}-${invalid.value}`"
            data-testid="qr-invalid-row"
          >
            <v-list-item-title> “{{ invalid.value }}” is no valid code </v-list-item-title>
            <v-list-item-subtitle class="text-wrap">
              Codes are lower-case letters, digits and dashes. On
              <router-link
                class="qr-codes-view__link"
                :to="{ name: 'document', params: { id: invalid.item.id } }"
              >
                {{ invalid.title }}
              </router-link>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </section>
    </template>

    <AppDialog
      :model-value="assigning !== null"
      @update:model-value="(open: boolean) => !open && (assigning = null)"
    >
      <v-card :title="`Put “${assigning}” on a page`">
        <v-card-text>
          <PageSelect v-model="page" testid="qr-assign-page" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="assigning = null">Cancel</v-btn>
          <v-btn color="primary" :disabled="!page" data-testid="qr-assign-confirm" @click="assign">
            Open the page
          </v-btn>
        </v-card-actions>
      </v-card>
    </AppDialog>
  </v-container>
</template>

<style scoped>
.qr-codes-view {
  max-width: 960px;
}
/* page names in the text of a row: like the rest of the row, underlined on hover */
.qr-codes-view__link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.qr-codes-view__link:hover,
.qr-codes-view__link:focus-visible {
  text-decoration: underline;
}
</style>
