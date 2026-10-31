/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string
  readonly VITE_WIKI_URL?: string
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
// Type declarations for markdown-it plugins without bundled types.

declare module 'markdown-it-task-lists' {
  const plugin: (md: import('markdown-it').MarkdownIt, options?: Record<string, unknown>) => void
  export default plugin
}

declare module 'markdown-it-footnote' {
  const plugin: (md: import('markdown-it').MarkdownIt, options?: Record<string, unknown>) => void
  export default plugin
}

declare module 'markdown-it-deflist' {
  const plugin: (md: import('markdown-it').MarkdownIt, options?: Record<string, unknown>) => void
  export default plugin
}

declare module 'markdown-it-mark' {
  const plugin: (md: import('markdown-it').MarkdownIt, options?: Record<string, unknown>) => void
  export default plugin
}

declare module 'markdown-it-attrs' {
  const plugin: (md: import('markdown-it').MarkdownIt, options?: Record<string, unknown>) => void
  export default plugin
}
