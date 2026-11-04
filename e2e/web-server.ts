/**
 * Builds the app once and serves it on one port per test worker. `config.json` differs per port and
 * points the app at the backend of that worker. A production build, because the dev server
 * re-optimizes dependencies on first use and reloads.
 */
import { build, preview } from 'vite'

import { backendPort, webPort, WORKERS } from './ports.ts'

const outDir = 'dist-e2e'

await build({ build: { outDir }, logLevel: 'warn' })

for (let worker = 0; worker < WORKERS; worker++) {
  const config = JSON.stringify({ backendUrl: `http://localhost:${backendPort(worker)}` })
  await preview({
    build: { outDir },
    logLevel: 'warn',
    preview: { port: webPort(worker), strictPort: true },
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
