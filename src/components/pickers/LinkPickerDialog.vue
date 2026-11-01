<script setup lang="ts">
import { mdiArrowLeft, mdiFileDocumentOutline, mdiPound } from '@mdi/js'
import { computed, ref, watch } from 'vue'

import { useApi } from '@/api'
import type { DocumentModel, TreeItem } from '@/api'
import TreeBrowser from '@/components/tree/TreeBrowser.vue'
import { headingsOf } from '@/markdown/headings'
import type { Heading } from '@/markdown/headings'
import { useTreeStore } from '@/stores/tree'

import { cleanUrl, escapeLinkText, markdownLink } from './markdown'

/**
 * Picks a link target: a page (optionally one of its headings), a folder or a file anywhere in
 * the wiki, or a web address. Emits the Markdown with the right relative path from the page.
 */
const props = defineProps<{
  /** The page the link goes into. */
  documentId: string
  /** Its current text (for links to its own headings). */
  text: string
  /** The selected text, which becomes the link text. */
  selection: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ insert: [markdown: string] }>()

const tree = useTreeStore()
const tab = ref<'wiki' | 'web'>('wiki')
const linkText = ref('')
const url = ref('')
const section = ref('')
const page = ref<DocumentModel | null>(null)
const headings = ref<Heading[] | null>(null)
const headingsError = ref(false)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    tab.value = /^[a-z][a-z0-9+.-]*:\/\//i.test(props.selection.trim()) ? 'web' : 'wiki'
    linkText.value = tab.value === 'web' ? '' : props.selection
    url.value = tab.value === 'web' ? props.selection.trim() : ''
    section.value = tree.parentOf(props.documentId)?.id ?? tree.root?.id ?? ''
    page.value = null
    headings.value = null
  },
  { immediate: true },
)

async function pick(item: TreeItem): Promise<void> {
  if (item.type !== 'document') {
    insert(item)
    return
  }
  page.value = item
  headings.value = null
  headingsError.value = false
  try {
    const text =
      item.id === props.documentId ? props.text : await useApi().getDocumentContent(item.id)
    if (page.value?.id === item.id) headings.value = headingsOf(text)
  } catch {
    headingsError.value = true
    headings.value = []
  }
}

function insert(item: TreeItem, heading?: Heading): void {
  const text = linkText.value.trim() || (heading ? heading.text : '')
  emit(
    'insert',
    markdownLink(tree, props.documentId, item, { text, anchor: heading?.id, asLink: true }),
  )
  open.value = false
}

const webValid = computed(() => url.value.trim() !== '')
function insertWeb(): void {
  if (!webValid.value) return
  const address = cleanUrl(url.value)
  emit('insert', `[${escapeLinkText(linkText.value.trim() || url.value.trim())}](${address})`)
  open.value = false
}

const ownPage = computed(() => page.value?.id === props.documentId)
</script>

<template>
  <v-dialog v-model="open" max-width="640" :fullscreen="$vuetify.display.xs" scrollable>
    <v-card data-testid="link-picker">
      <v-card-title class="d-flex align-center">
        <span class="flex-grow-1">Insert link</span>
      </v-card-title>
      <v-tabs v-model="tab" density="compact" class="px-4">
        <v-tab value="wiki" data-testid="link-tab-wiki">In the wiki</v-tab>
        <v-tab value="web" data-testid="link-tab-web">Web address</v-tab>
      </v-tabs>
      <v-card-text class="link-picker__body">
        <v-text-field
          v-model="linkText"
          label="Link text"
          :placeholder="tab === 'wiki' ? 'Name of the target' : 'The address'"
          persistent-placeholder
          density="compact"
          class="mb-2"
          hide-details
          data-testid="link-text"
        />
        <template v-if="tab === 'wiki'">
          <div v-if="page">
            <div class="d-flex align-center ga-2 mb-2">
              <v-btn
                :icon="mdiArrowLeft"
                variant="text"
                size="small"
                aria-label="Back"
                data-testid="link-back"
                @click="page = null"
              />
              <strong class="text-truncate">{{ page.name }}</strong>
            </div>
            <v-list density="compact" class="py-0">
              <v-list-item
                :prepend-icon="mdiFileDocumentOutline"
                :title="ownPage ? 'This page' : 'The whole page'"
                data-testid="link-page"
                @click="insert(page)"
              />
              <v-list-subheader v-if="headings && headings.length > 0">
                Or a heading on it
              </v-list-subheader>
              <v-list-item
                v-for="heading in headings ?? []"
                :key="heading.line"
                :title="heading.text"
                :subtitle="`#${heading.id}`"
                :prepend-icon="mdiPound"
                :style="{ paddingInlineStart: `${8 + (heading.level - 1) * 14}px` }"
                data-testid="link-heading"
                @click="insert(page, heading)"
              />
              <v-list-item v-if="headings === null" subtitle="Loading the headings …" />
              <v-list-item v-else-if="headingsError" subtitle="The headings could not be loaded." />
            </v-list>
          </div>
          <TreeBrowser
            v-else
            v-model:section="section"
            :types="['document', 'resource']"
            pick-sections
            search-placeholder="Search pages, folders and files…"
            @pick="pick"
          />
        </template>
        <v-form v-else @submit.prevent="insertWeb">
          <v-text-field
            v-model="url"
            label="Address"
            placeholder="https://"
            type="url"
            autofocus
            data-testid="link-url"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          v-if="tab === 'web'"
          color="primary"
          variant="flat"
          :disabled="!webValid"
          data-testid="link-insert-web"
          @click="insertWeb"
        >
          Insert
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.link-picker__body {
  min-height: 360px;
}
</style>
