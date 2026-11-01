/**
 * Colours of the code views: the Markdown editor (CodeMirror) and the code blocks of the
 * preview (highlight.js). The palettes are inspired by the IntelliJ themes ("IntelliJ Light"
 * and the dark New UI / Darcula look), with our own values tuned for WCAG AA (4.5:1) against
 * the editor and code block backgrounds (see `codeColors.spec.ts`). The chrome around them keeps
 * the Android colours in `vuetify.ts`. The Android app (`EditorPalette`) uses the same roles and
 * values, so both clients look alike.
 *
 * Every colour becomes a Vuetify theme colour `code-<name>`, so CSS reads it as
 * `rgb(var(--v-theme-code-<name>))` and it follows the light or dark theme by itself.
 */
export interface CodePalette {
  /** Background of fenced code (editor lines and preview blocks) and inline code. */
  background: string
  /** Background of the line with the cursor. */
  activeLine: string
  /** Background of selected text. */
  selection: string
  /** Search matches, and the current one. */
  searchMatch: string
  searchMatchSelected: string
  /** Other occurrences of the selected word, matching brackets. */
  selectionMatch: string
  /** Line numbers, and the number of the line with the cursor. */
  lineNumber: string
  lineNumberActive: string
  cursor: string

  /** Plain text. */
  text: string
  /** Headings, list markers, horizontal rules; keywords in code. */
  heading: string
  /** Bold and italic text; attributes, variables and properties in code. */
  emphasis: string
  /** Links and URLs; function names, titles and built-ins in code. */
  link: string
  /** Images; numbers in code. */
  image: string
  /** Inline and fenced code; strings in code. */
  code: string
  /** Quotes, strikethrough and markup characters; comments in code. */
  quote: string
  /** HTML tags; types, tags and names in code. */
  html: string
  /** Admonitions, task boxes, front matter; annotations and meta in code. */
  meta: string
  /** Removed lines of a diff. */
  deleted: string
}

/*
 * The shared roles (text to meta, line numbers, selection, cursor) have the same values as the
 * Android app's `EditorPalette`; the rest is web only (CodeMirror needs more states).
 */
export const CODE_LIGHT: CodePalette = {
  background: '#eef0e5',
  activeLine: '#f4f4e8',
  selection: '#ccddf5',
  searchMatch: '#f6e7a0',
  searchMatchSelected: '#eccd5e',
  selectionMatch: '#e0e4d4',
  lineNumber: '#666b60',
  lineNumberActive: '#1a1c18',
  cursor: '#1a1c18',

  text: '#1a1c18',
  heading: '#a3450c',
  emphasis: '#86218c',
  link: '#1a55c4',
  image: '#00727c',
  code: '#276f2e',
  quote: '#5b6155',
  html: '#7a5a00',
  meta: '#5e6600',
  deleted: '#b3261e',
}

export const CODE_DARK: CodePalette = {
  background: '#24271f',
  activeLine: '#21231e',
  selection: '#2e4560',
  searchMatch: '#3a5634',
  searchMatchSelected: '#4f5c1f',
  selectionMatch: '#353a31',
  lineNumber: '#878d81',
  lineNumberActive: '#cbcec5',
  cursor: '#e3e3dc',

  text: '#cbcec5',
  heading: '#e8a06e',
  emphasis: '#d59ad8',
  link: '#6cb2f7',
  image: '#4ec3c9',
  code: '#8bc890',
  quote: '#9aa094',
  html: '#e4c070',
  meta: '#b9bf5e',
  deleted: '#ef7f7a',
}

/** Background colours of the palette, the rest are text colours. */
export const CODE_BACKGROUNDS = [
  'background',
  'activeLine',
  'selection',
  'searchMatch',
  'searchMatchSelected',
  'selectionMatch',
] as const satisfies readonly (keyof CodePalette)[]

/** `activeLine` becomes `code-active-line`. */
export function codeColorName(key: keyof CodePalette): string {
  return `code-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** CSS colour of a palette entry for the current theme. */
export function codeColor(key: keyof CodePalette): string {
  return `rgb(var(--v-theme-${codeColorName(key)}))`
}

/** The palette as Vuetify theme colours. */
export function codeThemeColors(palette: CodePalette): Record<string, string> {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [codeColorName(key as keyof CodePalette), value]),
  )
}

/** Relative luminance of a `#rrggbb` colour (WCAG 2). */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** WCAG 2 contrast ratio of two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}
