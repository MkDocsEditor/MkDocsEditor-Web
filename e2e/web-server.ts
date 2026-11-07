/**
 * Builds the app once and serves it on one port per test worker. Each port passes `/api` on to
 * the backend of its worker, like the reverse proxy in production, and its `config.json` leaves
 * `backendUrl` empty, so the app uses `/api` of its own origin. A production build, because the
 * dev server re-optimizes dependencies on first use and reloads.
 */
import { build, preview } from 'vite'

import { API_PREFIX, backendPort, webPort, WORKERS } from './ports.ts'

const outDir = 'dist-e2e'

await build({ build: { outDir }, logLevel: 'warn' })

const config = JSON.stringify({ backendUrl: '' })
for (let worker = 0; worker < WORKERS; worker++) {
  await preview({
    build: { outDir },
    logLevel: 'warn',
    preview: {
      port: webPort(worker),
      strictPort: true,
      proxy: {
        [API_PREFIX]: { target: `http://127.0.0.1:${backendPort(worker)}`, ws: true },
      },
    },
    plugins: [
      {
        name: 'e2e-config-json',
        configurePreviewServer(server) {
          server.middlewares.use('/config.json', (_request, response) => {
            response.setHeader('Content-Type', 'application/json')
            response.end(config)
          })
        },
      },
    ],
  })
}
