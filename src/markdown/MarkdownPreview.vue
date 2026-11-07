<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useDebounced } from '@/composables/useDebounced'
import { isExternalUrl } from '@/services/linkPath'
import { openFile } from '@/composables/useOpenFile'
import { resourceObjectUrl } from '@/services/resourceUrls'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

import './preview.css'
import { renderMarkdown } from './render'
import { previewAnchor, previewScrollTop, visibleSourceLines } from './sourceLines'
import type { ScrollAnchor } from './sourceLines'
import type { ChangeTarget } from './changeRanges'

const props = defineProps<{
  text: string
  /** Folder of the document, for relative links and images. */
  sectionId?: string
  /** Where the editor is (split mode, while it drives); the preview shows the same place. */
  anchor?: ScrollAnchor
}>()
const emit = defineEmits<{
  /** The source lines on screen (0-based, inclusive), after every scroll, render or resize. */
  visibleLines: [lines: { first: number; last: number } | null]
  /** The reading place after a scroll, for scrolling the editor along. */
  anchor: [anchor: ScrollAnchor]
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

function openWithRetry(id: string, name: string): void {
  openFile(id, name).catch((e: unknown) =>
    notify.error(e, 'Could not open the file', () => openWithRetry(id, name)),
  )
}

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
  else if (item?.type === 'resource') openWithRetry(item.id, item.name)
  else notify.push(`Link target not found: ${href}`, 'warning')
}

/** The last line of the text that is rendered right now. */
function lastLine(): number {
  return debounced.value.split('\n').length - 1
}

/** Measures at most once per frame. */
let frame = 0
let scrolledSince = false
function measure(scrolled = false): void {
  scrolledSince ||= scrolled
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const root = container.value
    if (!root) return
    emit('visibleLines', visibleSourceLines(root, lastLine()))
    if (!scrolledSince) return
    scrolledSince = false
    const anchor = previewAnchor(root, lastLine())
    if (anchor) emit('anchor', anchor)
  })
}

let resizes: ResizeObserver | null = null
onMounted(() => {
  // also when the pane appears: it grows from nothing
  resizes = new ResizeObserver(() => measure())
  if (container.value) resizes.observe(container.value)
})
onBeforeUnmount(() => {
  resizes?.disconnect()
  cancelAnimationFrame(frame)
})
function showAnchor(): void {
  const root = container.value
  if (!props.anchor || !root) return
  const top = previewScrollTop(root, lastLine(), props.anchor)
  if (top !== null) root.scrollTo({ top })
}

watch(html, () =>
  nextTick(() => {
    // the new text moved the blocks: the place of the editor is somewhere else now
    showAnchor()
    measure()
  }),
)
watch(() => props.anchor, showAnchor)

/** How long a highlight stays (it fades out over that time); the same as in the editor. */
const FLASH_MS = 2_000
/** What to highlight once the text with it is rendered. */
let pendingFlash: readonly ChangeTarget[] | null = null

/** The rendered top-level blocks with their first source line (0-based), in text order. */
function blocks(root: HTMLElement): { el: HTMLElement; line: number }[] {
  return [...root.querySelectorAll<HTMLElement>(':scope > [data-source-line]')]
    .map((el) => ({ el, line: Number(el.dataset.sourceLine) }))
    .filter((b) => Number.isFinite(b.line))
}

/** One band over the blocks of a target, or a thin marker for removed lines. */
function bandOf(
  root: HTMLElement,
  all: { el: HTMLElement; line: number }[],
  target: ChangeTarget,
): { top: number; height: number } | undefined {
  const origin = root.getBoundingClientRect().top - root.scrollTop
  const from = target.from - 1
  const to = target.to - 1
  if (target.removal) {
    const after = all.find((b) => b.line >= from)
    if (after) return { top: after.el.getBoundingClientRect().top - origin - 3, height: 3 }
    const last = all.at(-1)
    return last && { top: last.el.getBoundingClientRect().bottom - origin, height: 3 }
  }
  // a block covers the lines up to the next block, without the blank lines after it; take those
  // that touch the target
  const lines = debounced.value.split('\n')
  const endOf = (i: number) => {
    let end = (all[i + 1]?.line ?? lines.length) - 1
    while (end > all[i]!.line && !lines[end]?.trim()) end--
    return end
  }
  const hit = all.filter((b, i) => b.line <= to && endOf(i) >= from)
  if (hit.length === 0) return undefined
  const top = hit[0]!.el.getBoundingClientRect().top - origin
  const bottom = Math.max(...hit.map((b) => b.el.getBoundingClientRect().bottom)) - origin
  return { top: top - 4, height: bottom - top + 8 }
}

function applyFlash(): void {
  const root = container.value
  if (!pendingFlash || !root || debounced.value !== props.text) return
  const all = blocks(root)
  const bands = pendingFlash
    .map((target) => {
      const band = bandOf(root, all, target)
      return band && { ...band, removal: target.removal === true }
    })
    .filter((b) => !!b)
  if (bands.length === 0) return
  pendingFlash = null
  root.scrollTo({ top: bands[0]!.top - 12 })
  // the next render of the text replaces the bands along with the rest
  for (const old of root.querySelectorAll('.markdown-preview__flash')) old.remove()
  for (const { top, height, removal } of bands) {
    const band = document.createElement('div')
    band.className = removal
      ? 'markdown-preview__flash markdown-preview__flash--removed'
      : 'markdown-preview__flash'
    band.dataset.testid = 'preview-flash'
    band.setAttribute('aria-hidden', 'true')
    band.style.top = `${top}px`
    band.style.height = `${height}px`
    root.append(band)
    setTimeout(() => band.remove(), FLASH_MS)
  }
}
watch(html, () => nextTick(applyFlash))

defineExpose({
  /** Scrolls the first target to the top and highlights all for a moment, once rendered. */
  flashLines(targets: readonly ChangeTarget[]): void {
    if (targets.length === 0) return
    pendingFlash = targets
    void nextTick(applyFlash)
  },
})
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- the HTML is sanitized with DOMPurify in renderMarkdown -->
  <article
    ref="container"
    class="markdown-preview"
    data-testid="markdown-preview"
    @click="onClick"
    @scroll.passive="measure(true)"
    v-html="html"
  />
</template>

<style>
/* stylelint-disable color-no-hex -- the highlight of ==marks==, which is not in the theme */
.markdown-preview {
  position: relative;
  height: 100%;
  overflow-y: auto;
  padding: var(--app-space-2) var(--app-space-6) var(--app-space-8);

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
@keyframes markdown-preview-flash {
  from {
    background-color: rgba(var(--v-theme-primary), 0.22);
  }
  to {
    background-color: transparent;
  }
}
@keyframes markdown-preview-flash-removed {
  from {
    background-color: rgba(var(--v-theme-primary), 0.9);
  }
  to {
    background-color: transparent;
  }
}
.markdown-preview__flash.markdown-preview__flash--removed {
  animation-name: markdown-preview-flash-removed;
}
.markdown-preview__flash {
  position: absolute;
  inset-inline: 0;
  pointer-events: none;
  animation: markdown-preview-flash 2s ease-in forwards;
}
</style>
