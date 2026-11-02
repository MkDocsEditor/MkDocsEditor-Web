/**
 * Entry point of the standalone renderer (`npm run build:preview`), which the Android app ships
 * as an asset for its offline preview. It only sets this global and touches nothing else.
 */
import './preview.css'
import { renderMarkdown } from './render'

declare global {
  interface Window {
    MkDocsRenderer: { renderMarkdown: typeof renderMarkdown }
  }
}

window.MkDocsRenderer = { renderMarkdown }
