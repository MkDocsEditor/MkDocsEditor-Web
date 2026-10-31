import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { buildBackend, createWiki, startBackend, TMP, writeConfig } from './backend'
import { BACKEND_PORT } from './ports'

/** Builds the backend and starts it with a fresh test wiki for the whole test run. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const bin = buildBackend()
  const workDir = path.join(TMP, 'run')
  mkdirSync(workDir, { recursive: true })
  const wiki = path.join(workDir, 'wiki')
  createWiki(wiki)
  const config = writeConfig(bin, workDir, wiki, BACKEND_PORT)
  const backend = await startBackend(bin, config, workDir, BACKEND_PORT)
  return async () => {
    await backend.stop()
    if (process.env.E2E_BACKEND_LOG)
      writeFileSync(process.env.E2E_BACKEND_LOG, backend.log.join(''))
  }
}
