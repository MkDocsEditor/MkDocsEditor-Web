import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BACKEND_PORT, USERS } from './ports'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmp = path.join(here, '.tmp')

/**
 * Finds or builds the backend binary:
 * - `E2E_BACKEND_BIN`: an existing binary,
 * - `E2E_BACKEND_DIR`: a backend checkout to build (default `e2e/.tmp/backend`, cloned from
 *   GitHub master when missing).
 */
function backendBinary(): string {
  if (process.env.E2E_BACKEND_BIN) return path.resolve(process.env.E2E_BACKEND_BIN)
  const dir = path.resolve(process.env.E2E_BACKEND_DIR ?? path.join(tmp, 'backend'))
  if (!existsSync(dir)) {
    execFileSync('git', [
      'clone',
      '--depth=1',
      'https://github.com/MkDocsEditor/MkDocsEditor-Backend.git',
      dir,
    ])
  }
  const bin = path.join(tmp, 'mkdocsrest')
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: dir, stdio: 'inherit' })
  return bin
}

/** A small German test wiki. */
function createWiki(root: string): void {
  rmSync(root, { recursive: true, force: true })
  const docs = path.join(root, 'docs')
  mkdirSync(path.join(docs, 'Rezepte', 'Kuchen'), { recursive: true })
  mkdirSync(path.join(docs, 'Urlaub'), { recursive: true })
  writeFileSync(path.join(root, 'mkdocs.yml'), 'site_name: E2E Wiki\n')
  writeFileSync(path.join(docs, 'index.md'), '# Willkommen\n\nDas ist das Test-Wiki.\n')
  writeFileSync(
    path.join(docs, 'Rezepte', 'Kuchen', 'Apfelkuchen.md'),
    [
      '# Apfelkuchen',
      '',
      'Siehe auch [Kürbissuppe](../Kürbissuppe.md).',
      '',
      '![Foto](apfel.png)',
      '',
      '!!! tip "Tipp"',
      '    Die Äpfel **dünn** schneiden.',
      '',
      '- [ ] Äpfel schälen',
      '- [x] Mehl kaufen',
      '',
    ].join('\n'),
  )
  // a 1x1 PNG
  writeFileSync(
    path.join(docs, 'Rezepte', 'Kuchen', 'apfel.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  )
  writeFileSync(path.join(docs, 'Rezepte', 'Kürbissuppe.md'), '# Kürbissuppe\n')
}

async function waitForBackend(process: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`backend exited with ${process.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/alive/`)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('backend did not start within 30 s')
}

export default async function globalSetup(): Promise<() => void> {
  mkdirSync(tmp, { recursive: true })
  const bin = backendBinary()
  const workDir = path.join(tmp, 'run')
  const wiki = path.join(workDir, 'wiki')
  createWiki(wiki)
  const hash = (password: string) =>
    execFileSync(bin, ['hash-password'], { input: password }).toString().trim()
  const users = Object.values(USERS).flatMap((user) => [
    `      - username: "${user.username}"`,
    `        passwordHash: "${hash(user.password)}"`,
    `        role: ${user.role}`,
  ])
  const config = path.join(workDir, 'mkdocsrest.yaml')
  writeFileSync(
    config,
    [
      'server:',
      '  host: "127.0.0.1"',
      `  port: ${BACKEND_PORT}`,
      '  auth:',
      '    users:',
      ...users,
      'mkdocs:',
      `  projectPath: "${wiki}"`,
      '',
    ].join('\n'),
  )

  const backend = spawn(bin, ['--config', config], {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log: string[] = []
  backend.stdout?.on('data', (chunk: Buffer) => log.push(chunk.toString()))
  backend.stderr?.on('data', (chunk: Buffer) => log.push(chunk.toString()))
  try {
    await waitForBackend(backend)
  } catch (error) {
    backend.kill()
    console.error(log.join(''))
    throw error
  }

  return () => {
    backend.kill()
    if (process.env.E2E_BACKEND_LOG) writeFileSync(process.env.E2E_BACKEND_LOG, log.join(''))
  }
}
