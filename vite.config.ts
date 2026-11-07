import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
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
