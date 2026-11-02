/**
 * Smoke test of the standalone renderer in `dist-preview/`: run `npm run build:preview` first.
 * It loads the script the way a WebView does, without any modules or network, and renders a
 * page. A broken bundle fails here, before it reaches the Android app.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { JSDOM } from 'jsdom'

const script = readFileSync('dist-preview/mkdocs-renderer.js', 'utf8')
const css = readFileSync('dist-preview/mkdocs-renderer.css', 'utf8')

assert.doesNotMatch(script, /\bimport\s*\(/, 'the script must not load chunks')
assert.doesNotMatch(script, /^\s*(import|export)\s/m, 'the script must not be a module')

const { window } = new JSDOM('<!doctype html><body><p id="page">untouched</p></body>', {
  runScripts: 'outside-only',
})
const before = window.document.documentElement.outerHTML
const globalsBefore = new Set(Object.getOwnPropertyNames(window))
window.eval(script)

const added = Object.getOwnPropertyNames(window).filter((name) => !globalsBefore.has(name))
assert.deepEqual(added, ['MkDocsRenderer'], 'the only new global')
assert.equal(window.document.documentElement.outerHTML, before, 'loading touches no document')

const html = window.MkDocsRenderer.renderMarkdown(
  [
    '---',
    'title: front matter',
    '---',
    '# Title',
    '',
    '![Plan](./my plan.png)',
    '',
    '!!! warning "Careful"',
    '    Inside',
    '',
    '```python',
    'def f(): pass',
    '```',
    '',
    '<script>window.hacked = true</script>',
  ].join('\n'),
)
const page = window.document.createElement('div')
page.innerHTML = html

assert.equal(page.querySelector('h1')?.textContent, 'Title')
assert.equal(page.querySelector('h1')?.getAttribute('data-source-line'), '3')
assert.equal(page.querySelector('img')?.getAttribute('src'), './my%20plan.png')
assert.equal(page.querySelector('.admonition.warning .admonition-title')?.textContent, 'Careful')
assert.ok(page.querySelector('pre.hljs .hljs-keyword'), 'code is highlighted')
assert.equal(page.querySelector('script'), null, 'the output is sanitized')
assert.ok(!html.includes('front matter'), 'front matter is not rendered')

// the languages the Android app had before it used this bundle, including aliases of them
for (const language of [
  'bash',
  'c',
  'cpp',
  'csharp',
  'cs',
  'css',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'gql',
  'ini',
  'java',
  'javascript',
  'jsx',
  'json',
  'kotlin',
  'less',
  'lua',
  'makefile',
  'markdown',
  'nginx',
  'objectivec',
  'objc',
  'perl',
  'php',
  'php-template',
  'plaintext',
  'powershell',
  'python',
  'python-repl',
  'r',
  'ruby',
  'rb',
  'rust',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'tsx',
  'vbnet',
  'vb',
  'wasm',
  'xml',
  'yaml',
]) {
  const fence = window.MkDocsRenderer.renderMarkdown(`\`\`\`${language}\nx\n\`\`\``)
  assert.ok(fence.includes(`class="language-${language}"`), `highlights ${language}`)
}

assert.match(css, /\.markdown-preview/)
assert.doesNotMatch(css, /--v-/, 'the stylesheet must not depend on Vuetify')
assert.doesNotMatch(css, /overflow-y|height:\s*100%/, 'the layout belongs to the clients')

console.log('preview bundle ok:', script.length, 'bytes of script,', css.length, 'bytes of css')
