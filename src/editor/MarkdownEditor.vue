<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
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
import { remoteCursors, setPeers } from './remoteCursors'
import { fileUpload } from './upload'
import type { UploadFiles } from './upload'

const props = defineProps<{
  session: DocumentSession
  showAuthorship?: boolean
  /** Uploads pasted or dropped files and returns their markdown; no uploads without it. */
  upload?: UploadFiles
}>()
const emit = defineEmits<{
  /** The first visible source line (0-based), for scrolling the preview along. */
  topLine: [line: number]
  /** The text changed (local or remote edit). */
  change: [text: string]
}>()

const host = ref<HTMLElement | null>(null)
const readOnly = new Compartment()
let view: EditorView | null = null

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
    backgroundColor: 'rgb(var(--v-theme-surface))',
    color: 'rgb(var(--v-theme-on-surface))',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'rgb(var(--v-theme-primary))' },
  '.cm-line': { padding: '0 16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(var(--v-theme-on-surface), 0.04)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(var(--v-theme-primary), 0.25) !important',
  },
  '.cm-cursor': { borderLeftColor: 'rgb(var(--v-theme-primary))' },
})

function isReadOnly(): boolean {
  return props.session.status.value.readOnly
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
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      placeholder('Hier schreiben …'),
      readOnly.of([EditorState.readOnly.of(isReadOnly()), EditorView.editable.of(!isReadOnly())]),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown-Text', spellcheck: 'true' }),
      theme,
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
  () => props.session.status.value.readOnly,
  (ro) =>
    view?.dispatch({
      effects: readOnly.reconfigure([EditorState.readOnly.of(ro), EditorView.editable.of(!ro)]),
    }),
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
