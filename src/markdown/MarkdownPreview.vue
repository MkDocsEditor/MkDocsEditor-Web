<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { openResource } from '@/services/resources'
import { resourceObjectUrl } from '@/services/resourceUrls'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

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
const debounced = ref(props.text)
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.text,
  (text) => {
    clearTimeout(timer)
    timer = setTimeout(() => (debounced.value = text), 150)
  },
)
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
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
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
  line-height: 1.6;
  font-size: 16px;
  word-wrap: break-word;
}
.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview h4 {
  line-height: 1.3;
  margin: 1.2em 0 0.5em;
  font-weight: 600;
}
.markdown-preview h1 {
  font-size: 1.8em;
  font-weight: 400;
  margin-top: 0.4em;
}
.markdown-preview h2 {
  font-size: 1.45em;
}
.markdown-preview h3 {
  font-size: 1.2em;
}
.markdown-preview p,
.markdown-preview ul,
.markdown-preview ol,
.markdown-preview table,
.markdown-preview pre,
.markdown-preview blockquote,
.markdown-preview dl {
  margin: 0 0 1em;
}
.markdown-preview ul,
.markdown-preview ol {
  padding-left: 1.6em;
}
.markdown-preview li.task-list-item {
  list-style: none;
}
.markdown-preview li.task-list-item input {
  margin: 0 0.4em 0 -1.3em;
}
.markdown-preview a {
  color: rgb(var(--v-theme-primary));
}
.markdown-preview img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.markdown-preview img.preview-image-missing {
  outline: 2px dashed rgb(var(--v-theme-error));
  min-width: 48px;
  min-height: 24px;
}
.markdown-preview code {
  font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.88em;
  color: rgb(var(--v-theme-code-text));
  background: rgb(var(--v-theme-code-background));
  border: 1px solid rgba(var(--v-border-color), 0.08);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.markdown-preview pre {
  background: rgb(var(--v-theme-code-background));
  border: 1px solid rgba(var(--v-border-color), 0.08);
  padding: 12px 14px;
  border-radius: 6px;
  overflow-x: auto;
  line-height: 1.5;
}
.markdown-preview pre code {
  background: none;
  border: none;
  padding: 0;
}
.markdown-preview table {
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
}
.markdown-preview th,
.markdown-preview td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  padding: 6px 12px;
}
.markdown-preview th {
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.markdown-preview blockquote {
  border-left: 4px solid rgba(var(--v-theme-on-surface), 0.2);
  padding-left: 1em;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.markdown-preview mark {
  background: #fff3a8;
  color: inherit;
}
.markdown-preview .footnotes {
  font-size: 0.9em;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

/* Admonitions, roughly like mkdocs-material. */
.markdown-preview .admonition {
  --admonition-color: #448aff;
  border-left: 4px solid var(--admonition-color);
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  margin: 0 0 1em;
  padding: 0 12px 1px;
  overflow: hidden;
}
.markdown-preview .admonition-title {
  margin: 0 -12px 0.8em;
  padding: 6px 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--admonition-color) 12%, transparent);
}
.markdown-preview details.admonition:not([open]) > .admonition-title {
  margin-bottom: 0;
}
.markdown-preview summary.admonition-title {
  cursor: pointer;
}
.markdown-preview .admonition.abstract,
.markdown-preview .admonition.summary,
.markdown-preview .admonition.tldr {
  --admonition-color: #00b0ff;
}
.markdown-preview .admonition.info,
.markdown-preview .admonition.todo {
  --admonition-color: #00b8d4;
}
.markdown-preview .admonition.tip,
.markdown-preview .admonition.hint,
.markdown-preview .admonition.important {
  --admonition-color: #00bfa5;
}
.markdown-preview .admonition.success,
.markdown-preview .admonition.check,
.markdown-preview .admonition.done {
  --admonition-color: #00c853;
}
.markdown-preview .admonition.question,
.markdown-preview .admonition.help,
.markdown-preview .admonition.faq {
  --admonition-color: #64dd17;
}
.markdown-preview .admonition.warning,
.markdown-preview .admonition.caution,
.markdown-preview .admonition.attention {
  --admonition-color: #ff9100;
}
.markdown-preview .admonition.failure,
.markdown-preview .admonition.fail,
.markdown-preview .admonition.missing {
  --admonition-color: #ff5252;
}
.markdown-preview .admonition.danger,
.markdown-preview .admonition.error {
  --admonition-color: #ff1744;
}
.markdown-preview .admonition.bug {
  --admonition-color: #f50057;
}
.markdown-preview .admonition.example {
  --admonition-color: #7c4dff;
}
.markdown-preview .admonition.quote,
.markdown-preview .admonition.cite {
  --admonition-color: #9e9e9e;
}

/*
 * Code highlighting (highlight.js classes) with the code palette of the editor
 * (plugins/codeColors.ts): IntelliJ-like colours that follow the light or dark theme.
 */
.markdown-preview pre.hljs,
.markdown-preview pre.hljs code {
  color: rgb(var(--v-theme-code-text));
}
.markdown-preview .hljs-comment,
.markdown-preview .hljs-quote {
  color: rgb(var(--v-theme-code-quote));
  font-style: italic;
}
.markdown-preview .hljs-keyword,
.markdown-preview .hljs-selector-tag,
.markdown-preview .hljs-literal,
.markdown-preview .hljs-symbol,
.markdown-preview .hljs-bullet,
.markdown-preview .hljs-char.escape_,
.markdown-preview .hljs-doctag {
  color: rgb(var(--v-theme-code-heading));
}
.markdown-preview .hljs-string,
.markdown-preview .hljs-regexp,
.markdown-preview .hljs-template-tag {
  color: rgb(var(--v-theme-code-code));
}
.markdown-preview .hljs-number {
  color: rgb(var(--v-theme-code-image));
}
.markdown-preview .hljs-title.function_,
.markdown-preview .hljs-function .hljs-title {
  color: rgb(var(--v-theme-code-link));
}
.markdown-preview .hljs-attr,
.markdown-preview .hljs-variable,
.markdown-preview .hljs-template-variable,
.markdown-preview .hljs-property,
.markdown-preview .hljs-selector-attr,
.markdown-preview .hljs-selector-class,
.markdown-preview .hljs-selector-id {
  color: rgb(var(--v-theme-code-emphasis));
}
.markdown-preview .hljs-built_in,
.markdown-preview .hljs-variable.language_ {
  color: rgb(var(--v-theme-code-link));
}
.markdown-preview .hljs-meta,
.markdown-preview .hljs-meta .hljs-keyword {
  color: rgb(var(--v-theme-code-meta));
}
.markdown-preview .hljs-meta .hljs-string {
  color: rgb(var(--v-theme-code-code));
}
.markdown-preview .hljs-tag,
.markdown-preview .hljs-name,
.markdown-preview .hljs-type,
.markdown-preview .hljs-title.class_,
.markdown-preview .hljs-variable.constant_,
.markdown-preview .hljs-selector-pseudo {
  color: rgb(var(--v-theme-code-html));
}
.markdown-preview .hljs-tag .hljs-attr {
  color: rgb(var(--v-theme-code-emphasis));
}
.markdown-preview .hljs-tag .hljs-string {
  color: rgb(var(--v-theme-code-code));
}
.markdown-preview .hljs-section {
  color: rgb(var(--v-theme-code-heading));
  font-weight: 700;
}
.markdown-preview .hljs-link {
  color: rgb(var(--v-theme-code-link));
  text-decoration: underline;
}
.markdown-preview .hljs-addition {
  color: rgb(var(--v-theme-code-code));
}
.markdown-preview .hljs-deletion {
  color: rgb(var(--v-theme-code-deleted));
}
.markdown-preview .hljs-emphasis {
  font-style: italic;
}
.markdown-preview .hljs-strong {
  font-weight: 700;
}
.v-theme--dark .markdown-preview mark {
  background: #6b5a00;
}
</style>
