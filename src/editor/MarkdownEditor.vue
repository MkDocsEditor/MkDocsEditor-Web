<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder,
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { DocumentSession } from '@/sync/session'

import { authorship, setAuthorship } from './authorship'
import { sessionBinding } from './binding'
import { codeTheme, lineNumberGutter, markdownMarkTags } from './codeTheme'
import { formattingKeymap } from './formatting'
import type { FormatName } from './formatting'
import { remoteCursors, setPeers } from './remoteCursors'
import { fileUpload } from './upload'
import type { UploadFiles } from './upload'

const props = defineProps<{
  session: DocumentSession
  showAuthorship?: boolean
  /** Uploads pasted or dropped files and returns their markdown; no uploads without it. */
  upload?: UploadFiles
  /** Shows line numbers (off on phones, where every column counts). */
  lineNumbers?: boolean
  /** Replaces formatting shortcuts, for example Ctrl+K with the link picker. */
  formatOverride?: Partial<Record<FormatName, () => boolean>>
}>()
const emit = defineEmits<{
  /** The first visible source line (0-based), for scrolling the preview along. */
  topLine: [line: number]
  /** The text changed (local or remote edit). */
  change: [text: string]
}>()

const host = ref<HTMLElement | null>(null)
const readOnly = new Compartment()
const gutter = new Compartment()
let view: EditorView | null = null

function readOnlyExtensions(value: boolean) {
  return [EditorState.readOnly.of(value), EditorView.editable.of(!value)]
}

function emitTopLine(): void {
  if (!view) return
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
  emit('topLine', view.state.doc.lineAt(block.from).number - 1)
}

onMounted(() => {
  const state = EditorState.create({
    doc: props.session.getText(),
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [markdownMarkTags],
      }),
      codeTheme(),
      gutter.of(props.lineNumbers ? lineNumberGutter() : []),
      formattingKeymap(() => props.formatOverride ?? {}),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      placeholder('Write here …'),
      readOnly.of(readOnlyExtensions(props.session.status.value.readOnly)),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown text', spellcheck: 'true' }),
      remoteCursors(),
      authorship(),
      sessionBinding(props.session),
      props.upload ? fileUpload(props.upload) : [],
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('change', update.state.doc.toString())
      }),
    ],
  })
  view = new EditorView({ state, parent: host.value! })
  view.scrollDOM.addEventListener('scroll', emitTopLine, { passive: true })
  pushPeers()
  pushAuthorship()
})

function pushPeers(): void {
  view?.dispatch({ effects: setPeers.of(props.session.peers.value) })
}

function pushAuthorship(): void {
  view?.dispatch({
    effects: setAuthorship.of({
      runs: props.session.authorship.value,
      visible: props.showAuthorship ?? false,
    }),
  })
}

watch(() => props.session.peers.value, pushPeers)
watch([() => props.session.authorship.value, () => props.showAuthorship], pushAuthorship)
watch(
  () => props.lineNumbers,
  (show) => view?.dispatch({ effects: gutter.reconfigure(show ? lineNumberGutter() : []) }),
)
watch(
  () => props.session.status.value.readOnly,
  (value) => view?.dispatch({ effects: readOnly.reconfigure(readOnlyExtensions(value)) }),
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

defineExpose({
  focus: () => view?.focus(),
  /** For tests and the toolbar. */
  getView: () => view,
})
</script>

<template>
  <div ref="host" class="markdown-editor" data-testid="markdown-editor" />
</template>

<style scoped>
.markdown-editor {
  height: 100%;
  min-height: 0;
}
</style>
