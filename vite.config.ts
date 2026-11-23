import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vuetify from 'vite-plugin-vuetify'

import { readChangelog } from './scripts/changelog.ts'

/** `virtual:changelog`: the pull requests merged before this build, see scripts/changelog.ts. */
function changelog(): Plugin {
  const id = 'virtual:changelog'
  return {
    name: 'changelog',
    resolveId: (source) => (source === id ? '\0' + id : undefined),
    load(source) {
      if (source !== '\0' + id) return undefined
      const root = fileURLToPath(new URL('./', import.meta.url))
      return `export default ${JSON.stringify(readChangelog(root))}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true }), changelog()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The app talks to the backend at /api of its own origin, as in production. The dev server
    // passes /api on to a local backend, with websockets; the backend serves every route under
    // /api itself, so the path stays as it is.
    proxy: {
      '/api': { target: process.env.DEV_BACKEND_URL || 'http://localhost:7413', ws: true },
    },
  },
  build: {
    target: 'es2022',
  },
})
