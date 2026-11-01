import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import nginx from 'highlight.js/lib/languages/nginx'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import markdownIt from 'markdown-it'
import type { MarkdownIt } from 'markdown-it'
import attrs from 'markdown-it-attrs'
import deflist from 'markdown-it-deflist'
import footnote from 'markdown-it-footnote'
import mark from 'markdown-it-mark'
import taskLists from 'markdown-it-task-lists'

import { admonitionPlugin } from './admonition'
import { spacedLinksPlugin } from './spacedLinks'

const languages = {
  bash,
  cpp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  makefile,
  markdown,
  nginx,
  plaintext,
  powershell,
  python,
  rust,
  shell,
  sql,
  typescript,
  xml,
  yaml,
}
for (const [name, language] of Object.entries(languages)) hljs.registerLanguage(name, language)
hljs.registerAliases(['sh', 'zsh', 'console'], { languageName: 'bash' })
hljs.registerAliases(['js'], { languageName: 'javascript' })
hljs.registerAliases(['ts'], { languageName: 'typescript' })
hljs.registerAliases(['html', 'vue', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['toml', 'conf'], { languageName: 'ini' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' })
hljs.registerAliases(['golang'], { languageName: 'go' })
hljs.registerAliases(['c', 'h', 'hpp', 'cc'], { languageName: 'cpp' })
hljs.registerAliases(['docker'], { languageName: 'dockerfile' })
hljs.registerAliases(['patch'], { languageName: 'diff' })
hljs.registerAliases(['rs'], { languageName: 'rust' })
hljs.registerAliases(['ps1', 'pwsh'], { languageName: 'powershell' })
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' })

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function createRenderer(): MarkdownIt {
  const md = markdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      const language = lang.split(/\s+/)[0] ?? ''
      if (language && hljs.getLanguage(language)) {
        const html = hljs.highlight(code, { language, ignoreIllegals: true }).value
        return `<pre class="hljs"><code class="language-${escapeHtml(language)}">${html}</code></pre>`
      }
      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
    },
  })
  md.use(spacedLinksPlugin)
  md.use(admonitionPlugin)
  md.use(footnote)
  md.use(taskLists, { enabled: false, label: true })
  md.use(deflist)
  md.use(mark)
  md.use(attrs, { allowedAttributes: ['id', 'class', 'width', 'height', 'align'] })

  // Remember the source line of every block, so the preview can follow the editor.
  for (const rule of [
    'paragraph_open',
    'heading_open',
    'list_item_open',
    'table_open',
    'blockquote_open',
    'admonition_open',
  ] as const) {
    const original = md.renderer.rules[rule]
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const token = tokens[idx]!
      if (token.map) token.attrSet('data-source-line', String(token.map[0]))
      return original
        ? original(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }
  }
  return md
}

let renderer: MarkdownIt | null = null

/**
 * Blanks out a leading YAML front matter block (MkDocs page meta data). The lines stay, so
 * source line numbers keep matching the editor.
 */
export function stripFrontMatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n(---|\.\.\.)\r?\n/.exec(source)
  if (!match) return source
  return '\n'.repeat(match[0].split('\n').length - 1) + source.slice(match[0].length)
}

/** Renders MkDocs flavoured markdown to sanitized HTML. */
export function renderMarkdown(source: string): string {
  renderer ??= createRenderer()
  const html = renderer.render(stripFrontMatter(source))
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-source-line', 'open', 'target'],
    ADD_TAGS: ['details', 'summary'],
  })
}
