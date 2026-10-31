import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { USERS, WEB_PORT } from './ports'

const here = path.dirname(fileURLToPath(import.meta.url))
export const TMP = path.join(here, '.tmp')
/** The wiki of the backend that global setup starts for all tests. */
export const MAIN_WIKI = path.join(TMP, 'run', 'wiki')

/** Runs git in a test wiki with a fixed identity. */
export function git(wiki: string, args: string[], author = 'E2E <e2e@example.com>'): string {
  const [, name = 'E2E', email = 'e2e@example.com'] = /^(.*) <(.*)>$/.exec(author) ?? []
  return execFileSync(
    'git',
    ['-c', `user.name=${name}`, '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false', ...args],
    { cwd: wiki },
  ).toString()
}
/** Where global setup leaves the built binary for the tests. */
const BIN_PATH = path.join(TMP, 'mkdocsrest')

/**
 * Finds or builds the backend binary:
 * - `E2E_BACKEND_BIN`: an existing binary,
 * - `E2E_BACKEND_DIR`: a backend checkout to build (default `e2e/.tmp/backend`, cloned from
 *   GitHub master when missing).
 */
export function buildBackend(): string {
  if (process.env.E2E_BACKEND_BIN) return path.resolve(process.env.E2E_BACKEND_BIN)
  const dir = path.resolve(process.env.E2E_BACKEND_DIR ?? path.join(TMP, 'backend'))
  if (!existsSync(dir)) {
    execFileSync('git', [
      'clone',
      '--depth=1',
      'https://github.com/MkDocsEditor/MkDocsEditor-Backend.git',
      dir,
    ])
  }
  mkdirSync(TMP, { recursive: true })
  execFileSync('go', ['build', '-o', BIN_PATH, '.'], { cwd: dir, stdio: 'inherit' })
  return BIN_PATH
}

export function backendBinary(): string {
  return process.env.E2E_BACKEND_BIN ? path.resolve(process.env.E2E_BACKEND_BIN) : BIN_PATH
}

/** A small German test wiki. */
export function createWiki(root: string): void {
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
  // a git repository, like a real wiki, so the backend can commit and show the history
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'Test-Wiki'])
}

const hashes = new Map<string, string>()

export interface ConfigOptions {
  /** Import the three test users (default). Without them the backend starts in setup mode. */
  users?: boolean
  /** Real rate limits with this per-IP burst; by default they are off for the tests. */
  perIpBurst?: number
}

/**
 * Writes a backend config for a wiki and returns its path. The web client under test runs on
 * `http://localhost:WEB_PORT` and reaches the backend on `http://localhost:port`: same site, so
 * the session cookie works over plain HTTP, and `localhost` is a valid passkey RP ID.
 */
export function writeConfig(
  bin: string,
  workDir: string,
  wiki: string,
  port: number,
  options: ConfigOptions = {},
): string {
  const hash = (password: string) => {
    let value = hashes.get(password)
    if (!value) {
      value = execFileSync(bin, ['hash-password'], { input: password }).toString().trim()
      hashes.set(password, value)
    }
    return value
  }
  const webOrigin = `http://localhost:${WEB_PORT}`
  const users = (options.users === false ? [] : Object.values(USERS)).flatMap((user) => [
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
      `  port: ${port}`,
      '  cors:',
      `    allowedOrigins: ["${webOrigin}"]`,
      '  auth:',
      `    clientUrl: "${webOrigin}"`,
      '    webauthn:',
      '      rpId: "localhost"',
      // many logins from one address in a test run
      '    rateLimits:',
      ...(options.perIpBurst
        ? [`      perIpBurst: ${options.perIpBurst}`, '      perIpRefill: "10m"']
        : ['      disabled: true']),
      ...(users.length ? ['    users:', ...users] : ['    users: []']),
      'git:',
      '  enabled: true',
      'mkdocs:',
      `  projectPath: "${wiki}"`,
      '',
    ].join('\n'),
  )
  return config
}

export interface RunningBackend {
  process: ChildProcess
  log: string[]
  stop(): Promise<void>
}

/** Starts the backend and waits for `/alive/`. */
export async function startBackend(
  bin: string,
  config: string,
  workDir: string,
  port: number,
): Promise<RunningBackend> {
  const child = spawn(bin, ['--config', config], {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log: string[] = []
  child.stdout?.on('data', (chunk: Buffer) => log.push(chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => log.push(chunk.toString()))
  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
      child.kill('SIGTERM')
    })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`backend exited with ${child.exitCode}:\n${log.join('')}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/alive/`)
      if (response.ok) return { process: child, log, stop }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  await stop()
  throw new Error(`backend did not start within 30 s:\n${log.join('')}`)
}

/** Waits for a line of the backend log that matches and returns the first group. */
export async function waitForLog(
  backend: RunningBackend,
  pattern: RegExp,
  timeout = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const match = pattern.exec(backend.log.join(''))
    if (match) return match[1] ?? match[0]
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`no ${pattern} in the backend log:\n${backend.log.join('')}`)
}
