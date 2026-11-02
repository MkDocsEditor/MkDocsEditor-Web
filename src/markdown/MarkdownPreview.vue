<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useDebounced } from '@/services/debounced'
import { isExternalUrl } from '@/services/linkPath'
import { openResource } from '@/services/resources'
import { resourceObjectUrl } from '@/services/resourceUrls'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

import './preview.css'
import { renderMarkdown } from './render'

const props = defineProps<{
  text: string
  /** Folder of the document, for relative links and images. */
  sectionId?: string
  /** First visible source line of the editor; the preview scrolls to it. */
  topLine?: number
}>()

const tree = useTreeStore()
const router = useRouter()
const notify = useNotifyStore()
const container = ref<HTMLElement | null>(null)

// Rendering is cheap, but not free: re-render at most every 150 ms while typing.
const debounced = useDebounced(() => props.text, 150)
const html = computed(() => renderMarkdown(debounced.value))

function resolve(href: string) {
  return props.sectionId ? tree.resolve(props.sectionId, href) : undefined
}

async function loadImages(): Promise<void> {
  await nextTick()
  const images = container.value?.querySelectorAll<HTMLImageElement>('img[src]') ?? []
  for (const img of images) {
    const src = img.getAttribute('src') ?? ''
    const item = resolve(src)
    if (item?.type !== 'resource') continue
    img.removeAttribute('src')
    img.dataset.resourceId = item.id
    resourceObjectUrl(item.id)
      .then((url) => {
        if (img.dataset.resourceId === item.id) img.src = url
      })
      .catch(() => img.classList.add('preview-image-missing'))
  }
}
watch([html, () => tree.root], loadImages, { immediate: true })

async function onClick(event: MouseEvent): Promise<void> {
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href')
  if (!anchor || !href || event.defaultPrevented || event.button !== 0) return
  if (href.startsWith('#')) return
  if (isExternalUrl(href)) {
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    return
  }
  event.preventDefault()
  const item = resolve(href)
  if (item?.type === 'document') await router.push({ name: 'document', params: { id: item.id } })
  else if (item?.type === 'section') await router.push({ name: 'section', params: { id: item.id } })
  else if (item?.type === 'resource') openResource(item.id).catch((e: unknown) => notify.error(e))
  else notify.push(`Link target not found: ${href}`, 'warning')
}

watch(
  () => props.topLine,
  (line) => {
    const root = container.value
    if (line === undefined || !root) return
    let target: HTMLElement | null = null
    for (const el of root.querySelectorAll<HTMLElement>('[data-source-line]')) {
      if (Number(el.dataset.sourceLine) <= line) target = el
      else break
    }
    root.scrollTo({ top: target ? target.offsetTop - root.offsetTop : 0 })
  },
)
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- the HTML is sanitized with DOMPurify in renderMarkdown -->
  <article
    ref="container"
    class="markdown-preview"
    data-testid="markdown-preview"
    @click="onClick"
    v-html="html"
  />
</template>

<style>
.markdown-preview {
  height: 100%;
  overflow-y: auto;
  padding: 12px 20px 48px;

  /* the variables of preview.css, from the Vuetify theme */
  --md-primary: rgb(var(--v-theme-primary));
  --md-error: rgb(var(--v-theme-error));
  --md-mark-background: #fff3a8;
  --md-on-surface-rgb: var(--v-theme-on-surface);
  --md-border-color-rgb: var(--v-border-color);
  --md-code-annotation: rgb(var(--v-theme-code-annotation));
  --md-code-attribute: rgb(var(--v-theme-code-attribute));
  --md-code-background: rgb(var(--v-theme-code-code-background));
  --md-code-comment: rgb(var(--v-theme-code-comment));
  --md-code-constant: rgb(var(--v-theme-code-constant));
  --md-code-deleted: rgb(var(--v-theme-code-deleted));
  --md-code-function: rgb(var(--v-theme-code-function));
  --md-code-heading: rgb(var(--v-theme-code-heading));
  --md-code-inserted: rgb(var(--v-theme-code-inserted));
  --md-code-keyword: rgb(var(--v-theme-code-keyword));
  --md-code-number: rgb(var(--v-theme-code-number));
  --md-code-property: rgb(var(--v-theme-code-property));
  --md-code-string: rgb(var(--v-theme-code-string));
  --md-code-tag: rgb(var(--v-theme-code-tag));
  --md-code-text: rgb(var(--v-theme-code-text));
  --md-code-url: rgb(var(--v-theme-code-url));
}
.v-theme--dark .markdown-preview {
  --md-mark-background: #6b5a00;
}
</style>
