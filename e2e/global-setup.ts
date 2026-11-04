import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { buildBackend, createWiki, mainWiki, startBackend, writeConfig } from './backend'
import type { RunningBackend } from './backend'
import { backendPort, webPort, WORKERS } from './ports'

/** Builds the backend and starts one per worker, each with a fresh test wiki, for the whole run. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const bin = buildBackend()
  const start = (worker: number): Promise<RunningBackend> => {
    const wiki = mainWiki(worker)
    const workDir = path.dirname(wiki)
    mkdirSync(workDir, { recursive: true })
    createWiki(wiki)
    const port = backendPort(worker)
    const config = writeConfig(bin, workDir, wiki, port, { webPort: webPort(worker) })
    return startBackend(bin, config, workDir, port)
  }
  const backends = await Promise.all(Array.from({ length: WORKERS }, (_, worker) => start(worker)))
  return async () => {
    await Promise.all(backends.map((backend) => backend.stop()))
    if (process.env.E2E_BACKEND_LOG)
      writeFileSync(
        process.env.E2E_BACKEND_LOG,
        backends
          .map((backend, worker) => `=== backend of worker ${worker} ===\n${backend.log.join('')}`)
          .join('\n'),
      )
  }
}
