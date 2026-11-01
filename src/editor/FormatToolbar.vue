<script setup lang="ts">
import {
  mdiAlertBoxOutline,
  mdiCodeBraces,
  mdiCodeTags,
  mdiFormatBold,
  mdiFormatHeaderPound,
  mdiFormatItalic,
  mdiFormatListBulleted,
  mdiFormatListChecks,
  mdiFormatListNumbered,
  mdiFormatQuoteClose,
  mdiFormatStrikethroughVariant,
  mdiImageOutline,
  mdiLinkVariant,
  mdiMinus,
  mdiTable,
} from '@mdi/js'
import type { EditorView } from '@codemirror/view'

import {
  ADMONITION_TYPES,
  FORMATS,
  SHORTCUTS,
  admonition,
  runFormat,
  shortcutLabel,
  toggleHeading,
} from './formatting'
import type { Format, FormatName } from './formatting'

const props = defineProps<{
  /** The editor to format (null while it loads). */
  view: () => EditorView | null
  disabled?: boolean
  /** Replaces the built-in command of a button, for example the link picker. */
  override?: Partial<Record<FormatName, () => void>>
}>()

interface Button {
  name: FormatName
  icon: string
  label: string
}

/** Groups of buttons, separated by dividers. The first group matches the Android app's bar. */
const groups: Button[][] = [
  [
    { name: 'bold', icon: mdiFormatBold, label: 'Bold' },
    { name: 'italic', icon: mdiFormatItalic, label: 'Italic' },
    { name: 'strikethrough', icon: mdiFormatStrikethroughVariant, label: 'Strikethrough' },
    { name: 'code', icon: mdiCodeTags, label: 'Inline code' },
  ],
  [
    { name: 'bulletList', icon: mdiFormatListBulleted, label: 'Bulleted list' },
    { name: 'orderedList', icon: mdiFormatListNumbered, label: 'Numbered list' },
    { name: 'taskList', icon: mdiFormatListChecks, label: 'Task list' },
    { name: 'quote', icon: mdiFormatQuoteClose, label: 'Quote' },
    { name: 'codeBlock', icon: mdiCodeBraces, label: 'Code block' },
  ],
  [
    { name: 'link', icon: mdiLinkVariant, label: 'Link' },
    { name: 'image', icon: mdiImageOutline, label: 'Image or file' },
    { name: 'table', icon: mdiTable, label: 'Table' },
    { name: 'horizontalRule', icon: mdiMinus, label: 'Horizontal line' },
  ],
]

function tooltip(button: Button): string {
  const key = SHORTCUTS[button.name]
  return key ? `${button.label} (${shortcutLabel(key)})` : button.label
}

function run(format: Format): void {
  const view = props.view()
  if (view) runFormat(view, format)
}

function press(name: FormatName): void {
  const custom = props.override?.[name]
  if (custom) custom()
  else run(FORMATS[name])
}

const headingShortcut = (level: number) => shortcutLabel(`Mod-Alt-${level}`)
const levels = [1, 2, 3, 4, 5, 6]
const title = (type: string) => type.charAt(0).toUpperCase() + type.slice(1)
</script>

<template>
  <!-- mousedown.prevent keeps the focus (and the phone keyboard) in the editor -->
  <div
    class="format-toolbar"
    role="toolbar"
    aria-label="Formatting"
    data-testid="format-toolbar"
    @mousedown.prevent
  >
    <v-menu location="bottom start">
      <template #activator="{ props: menu }">
        <v-btn
          v-bind="menu"
          :icon="mdiFormatHeaderPound"
          :disabled="disabled"
          variant="text"
          size="small"
          rounded="lg"
          aria-label="Heading"
          title="Heading"
          data-testid="format-heading"
        />
      </template>
      <v-list density="compact" @mousedown.prevent>
        <v-list-item
          v-for="level in levels"
          :key="level"
          :data-testid="`format-heading-${level}`"
          @click="run(toggleHeading(level))"
        >
          <v-list-item-title :class="`format-toolbar__h${level}`"
            >Heading {{ level }}</v-list-item-title
          >
          <template #append>
            <span class="text-caption text-medium-emphasis ms-4">{{ headingShortcut(level) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-menu>
    <template v-for="(group, index) in groups" :key="index">
      <v-divider vertical class="format-toolbar__divider" />
      <v-btn
        v-for="button in group"
        :key="button.name"
        :icon="button.icon"
        :disabled="disabled"
        variant="text"
        size="small"
        rounded="lg"
        :aria-label="tooltip(button)"
        :title="tooltip(button)"
        :data-testid="`format-${button.name}`"
        @click="press(button.name)"
      />
    </template>
    <v-menu location="bottom end">
      <template #activator="{ props: menu }">
        <v-btn
          v-bind="menu"
          :icon="mdiAlertBoxOutline"
          :disabled="disabled"
          variant="text"
          size="small"
          rounded="lg"
          aria-label="Admonition"
          title="Admonition"
          data-testid="format-admonition"
        />
      </template>
      <v-list density="compact" @mousedown.prevent>
        <v-list-item
          v-for="type in ADMONITION_TYPES"
          :key="type"
          :title="title(type)"
          :data-testid="`format-admonition-${type}`"
          @click="run(admonition(type))"
        >
          <template #prepend>
            <span class="format-toolbar__swatch" :class="`format-toolbar__swatch--${type}`" />
          </template>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<style scoped>
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  flex: none;
}
.format-toolbar > * {
  flex: none;
}
.format-toolbar__divider {
  height: 24px;
  align-self: center;
  margin: 0 4px;
}
.format-toolbar__h1 {
  font-size: 1.3em;
  font-weight: 700;
}
.format-toolbar__h2 {
  font-size: 1.15em;
  font-weight: 700;
}
.format-toolbar__h3,
.format-toolbar__h4,
.format-toolbar__h5,
.format-toolbar__h6 {
  font-weight: 700;
}
.format-toolbar__swatch {
  display: inline-block;
  width: 4px;
  height: 20px;
  border-radius: 2px;
  margin-inline-end: 12px;
  background: #448aff;
}
.format-toolbar__swatch--abstract {
  background: #00b0ff;
}
.format-toolbar__swatch--info {
  background: #00b8d4;
}
.format-toolbar__swatch--tip {
  background: #00bfa5;
}
.format-toolbar__swatch--success {
  background: #00c853;
}
.format-toolbar__swatch--question {
  background: #64dd17;
}
.format-toolbar__swatch--warning {
  background: #ff9100;
}
.format-toolbar__swatch--failure {
  background: #ff5252;
}
.format-toolbar__swatch--danger {
  background: #ff1744;
}
.format-toolbar__swatch--bug {
  background: #f50057;
}
.format-toolbar__swatch--example {
  background: #7c4dff;
}
.format-toolbar__swatch--quote {
  background: #9e9e9e;
}
</style>
