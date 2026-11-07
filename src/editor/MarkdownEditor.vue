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

import { scrollProgress } from '@/markdown/sourceLines'
import type { ScrollAnchor } from '@/markdown/sourceLines'
import type { DocumentSession } from '@/sync/session'

import { authorship, setAuthorship } from './authorship'
import type { AuthorHighlightMode } from './authorship'
import { isLocalEdit, sessionBinding } from './binding'
import { codeTheme, lineNumberGutter, markdownMarkTags } from './codeTheme'
import { formattingKeymap } from './formatting'
import type { FormatName } from './formatting'
import { remoteCursors, setPeers } from './remoteCursors'
import { fileUpload } from './upload'
import type { UploadFiles } from './upload'
import { createViewportPublisher } from './viewportPublisher'

const props = defineProps<{
  session: DocumentSession
  authorHighlight?: AuthorHighlightMode
  /** Uploads pasted or dropped files and returns their markdown; no uploads without it. */
  upload?: UploadFiles
  /** Shows line numbers (off on phones, where every column counts). */
  lineNumbers?: boolean
  /** Replaces formatting shortcuts, for example Ctrl+K with the link picker. */
  formatOverride?: Partial<Record<FormatName, () => boolean>>
  /** Whether the pane of the editor is on screen, which followers of this user need to know. */
  shown?: boolean
}>()
const emit = defineEmits<{
  /** The reading place after a scroll or an edit, for scrolling the preview along. */
  anchor: [anchor: ScrollAnchor]
  /** The text changed (local or remote edit). */
  change: [text: string]
  /** This user changed the text. */
  localEdit: []
}>()

const host = ref<HTMLElement | null>(null)
const readOnly = new Compartment()
const gutter = new Compartment()
let view: EditorView | null = null
let viewportPublisher: ReturnType<typeof createViewportPublisher> | null = null

function readOnlyExtensions(value: boolean) {
  return [EditorState.readOnly.of(value), EditorView.editable.of(!value)]
}

/** The source place at a height of the document (CodeMirror's heights), 0-based with fraction. */
function lineAtHeight(editor: EditorView, height: number): number {
  const block = editor.lineBlockAtHeight(height)
  const within = block.height > 0 ? (height - block.top) / block.height : 0
  return editor.state.doc.lineAt(block.from).number - 1 + Math.max(0, Math.min(1, within))
}

/** The reading place: at the height of the scroll progress, so both panes end together. */
function progressAnchor(editor: EditorView): ScrollAnchor {
  const scroller = editor.scrollDOM
  const at = scrollProgress(scroller)
  const y = scroller.getBoundingClientRect().top + at * scroller.clientHeight
  return { line: lineAtHeight(editor, y - editor.documentTop), at }
}

/** While typing, the caret is the reading place, at its height. Null when it is not in view. */
function caretAnchor(editor: EditorView): ScrollAnchor | null {
  const caret = editor.coordsAtPos(editor.state.selection.main.head)
  const scroller = editor.scrollDOM
  if (!caret || scroller.clientHeight === 0) return null
  const at = (caret.top - scroller.getBoundingClientRect().top) / scroller.clientHeight
  if (at < 0 || at > 1) return null
  return { line: lineAtHeight(editor, caret.top - editor.documentTop), at }
}

/** Scrolls caused by typing (CodeMirror keeps the caret in view) still follow the caret. */
const TYPING_MS = 300
let typedAt = -Infinity

function emitAnchor(): void {
  if (!view) return
  const typing = performance.now() - typedAt < TYPING_MS
  emit('anchor', (typing && caretAnchor(view)) || progressAnchor(view))
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
        if (update.transactions.some(isLocalEdit)) {
          emit('localEdit')
          typedAt = performance.now()
          update.view.requestMeasure({ read: emitAnchor })
        }
        if (update.docChanged || update.geometryChanged) viewportPublisher?.publish()
      }),
    ],
  })
  view = new EditorView({ state, parent: host.value! })
  view.scrollDOM.addEventListener('scroll', emitAnchor, { passive: true })
  viewportPublisher = createViewportPublisher(view, props.session, () => props.shown !== false)
  viewportPublisher.publish()
  pushPeers()
  pushAuthorship()
})

function pushPeers(): void {
  const ghosts = props.session.ghosts.value.map((ghost) => ({ ...ghost, ghost: true }))
  view?.dispatch({ effects: setPeers.of([...props.session.peers.value, ...ghosts]) })
}

function pushAuthorship(): void {
  view?.dispatch({
    effects: setAuthorship.of({
      runs: props.session.authorship.value,
      mode: props.authorHighlight ?? 'off',
    }),
  })
}

watch([() => props.session.peers.value, () => props.session.ghosts.value], pushPeers)
watch(
  () => props.shown,
  () => viewportPublisher?.publish(),
  { flush: 'post' },
)
watch([() => props.session.authorship.value, () => props.authorHighlight], pushAuthorship)
watch(
  () => props.lineNumbers,
  (show) => view?.dispatch({ effects: gutter.reconfigure(show ? lineNumberGutter() : []) }),
)
watch(
  () => props.session.status.value.readOnly,
  (value) => view?.dispatch({ effects: readOnly.reconfigure(readOnlyExtensions(value)) }),
)

onBeforeUnmount(() => {
  viewportPublisher?.destroy()
  viewportPublisher = null
  view?.destroy()
  view = null
})

/** Shows a source place at its height, as the preview scrolled. */
function scrollToAnchor(anchor: ScrollAnchor): void {
  if (!view) return
  const doc = view.state.doc
  const index = Math.max(0, Math.min(doc.lines - 1, Math.floor(anchor.line)))
  const within = Math.max(0, Math.min(1, anchor.line - index))
  const from = doc.line(index + 1).from
  const offset = anchor.at * view.scrollDOM.clientHeight - within * view.lineBlockAt(from).height
  // CodeMirror measures the lines on the way: an estimate of their height would land beside it
  view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: offset }) })
}

defineExpose({
  focus: () => view?.focus(),
  scrollToAnchor,
  /** Where the editor is now, for aligning the preview once. */
  currentAnchor: (): ScrollAnchor | null => (view ? progressAnchor(view) : null),
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
