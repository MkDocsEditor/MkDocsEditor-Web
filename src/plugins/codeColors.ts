/**
 * Colours of the code views: the Markdown editor (CodeMirror) and the code blocks of the
 * preview (highlight.js). The palettes are inspired by the IntelliJ themes ("IntelliJ Light"
 * and the dark New UI / Darcula look), tuned for WCAG AA (4.5:1) against the editor and code
 * block backgrounds (see `codeColors.spec.ts`). The chrome around them keeps the Android colours
 * in `vuetify.ts`. Roles and values are those of the Android app's `EditorPalette`, so both
 * clients look alike; keep them in sync.
 *
 * Every colour becomes a Vuetify theme colour `code-<name>`, so CSS reads it as
 * `rgb(var(--v-theme-code-<name>))` and it follows the light or dark theme by itself.
 */
export interface CodePalette {
  /** Background of inline code and code blocks (editor lines and preview). */
  codeBackground: string
  /** Background of selected text. */
  selection: string
  /** Line numbers. */
  lineNumber: string

  /** Plain text. */
  text: string
  /** Comments, quotes, horizontal rules and fence lines. */
  comment: string
  /** Keywords; list and quote markers, task boxes. */
  keyword: string
  /** Strings; inline code, attribute values. */
  string: string
  number: string
  /** Function and method names. */
  function: string
  /** Properties, keys and variables. */
  property: string
  /** Built-in types and constants. */
  constant: string
  /** Annotations, decorators, admonition markers, front matter. */
  annotation: string
  /** HTML and XML tag names. */
  tag: string
  /** HTML and XML attribute names. */
  attribute: string
  /** Markdown headings. */
  heading: string
  /** Markdown link text. */
  link: string
  /** URLs and link targets. */
  url: string
  /** Diff: added and removed lines. */
  inserted: string
  deleted: string

  /* Web only: CodeMirror has more states than the Android editor. */
  /** Background of the line with the cursor. */
  activeLine: string
  /** Search matches, and the current one. */
  searchMatch: string
  searchMatchSelected: string
  /** Other occurrences of the selected word, matching brackets. */
  selectionMatch: string
  /** The number of the line with the cursor. */
  lineNumberActive: string
  cursor: string
}

/*
 * Everything up to `deleted` has the values of the Android app's `EditorPalette` (Android #79);
 * the web-only states below are tuned to them. The editor background is the app surface
 * (`vuetify.ts`), the same as on Android.
 */
export const CODE_LIGHT: CodePalette = {
  codeBackground: '#f2f3ea',
  selection: '#c8def9',
  lineNumber: '#6b6f66',
  text: '#1a1c18',
  comment: '#676b62',
  keyword: '#2340a8',
  string: '#1a7a2d',
  number: '#1259c3',
  function: '#00657d',
  property: '#8a1f96',
  constant: '#7b3ab0',
  annotation: '#776500',
  tag: '#2340a8',
  attribute: '#1f5bc8',
  heading: '#2340a8',
  link: '#1d4fc4',
  url: '#1a7a2d',
  inserted: '#1a7a2d',
  deleted: '#b3261e',

  activeLine: '#f4f4e8',
  searchMatch: '#f6e7a0',
  searchMatchSelected: '#eccd5e',
  selectionMatch: '#e0e4d4',
  lineNumberActive: '#1a1c18',
  cursor: '#1a1c18',
}

export const CODE_DARK: CodePalette = {
  codeBackground: '#252722',
  selection: '#263b57',
  lineNumber: '#8a8f85',
  text: '#e3e3dc',
  comment: '#8f948c',
  keyword: '#d4895a',
  string: '#79b46f',
  number: '#33b0c0',
  function: '#5aa9f0',
  property: '#c98bc6',
  constant: '#b39ddb',
  annotation: '#bdb76a',
  tag: '#d6b974',
  attribute: '#b0bcc8',
  heading: '#e8a36a',
  link: '#6fb2f2',
  url: '#79b46f',
  inserted: '#79b46f',
  deleted: '#ef7f7a',

  activeLine: '#21231e',
  searchMatch: '#3a5634',
  searchMatchSelected: '#4f5c1f',
  selectionMatch: '#353a31',
  lineNumberActive: '#e3e3dc',
  cursor: '#e3e3dc',
}

/** Background colours of the palette, the rest are text colours. */
export const CODE_BACKGROUNDS = [
  'codeBackground',
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
