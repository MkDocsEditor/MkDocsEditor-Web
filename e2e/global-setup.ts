import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  assertPortFree,
  buildBackend,
  createWiki,
  mainWiki,
  startBackend,
  writeConfig,
} from './backend'
import type { RunningBackend } from './backend'
import { backendPort, webPort, WORKERS } from './ports'

/** Builds the backend and starts one per worker, each with a fresh test wiki, for the whole run. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const bin = buildBackend()
  const start = async (worker: number): Promise<RunningBackend> => {
    const port = backendPort(worker)
    // before the wiki is replaced, which would also break a run that is still using it
    await assertPortFree(port)
    const wiki = mainWiki(worker)
    const workDir = path.dirname(wiki)
    mkdirSync(workDir, { recursive: true })
    createWiki(wiki)
    const config = writeConfig(bin, workDir, wiki, port, { webPort: webPort(worker) })
    return startBackend(bin, config, workDir, port)
  }
  const started = await Promise.allSettled(
    Array.from({ length: WORKERS }, (_, worker) => start(worker)),
  )
  const backends = started.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  const stopAll = () => Promise.all(backends.map((backend) => backend.stop()))
  const failed = started.find((result) => result.status === 'rejected')
  if (failed) {
    // without a teardown, the backends that did start would keep their ports after the run
    await stopAll()
    throw failed.reason
  }
  return async () => {
    await stopAll()
    if (process.env.E2E_BACKEND_LOG)
      writeFileSync(
        process.env.E2E_BACKEND_LOG,
        backends
          .map((backend, worker) => `=== backend of worker ${worker} ===\n${backend.log.join('')}`)
          .join('\n'),
      )
  }
}
