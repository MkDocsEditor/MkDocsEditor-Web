/**
 * How many test workers run at once. Each has its own backend with its own wiki and users, and its
 * own port of the app, so tests of different workers cannot see each other.
 */
export const WORKERS = Number(process.env.E2E_WORKERS ?? 4)

export const backendPort = (worker: number) =>
  Number(process.env.E2E_BACKEND_PORT ?? 17414) + worker
export const webPort = (worker: number) => Number(process.env.E2E_WEB_PORT ?? 4174) + worker

/**
 * For a test that needs a backend of its own, stopped before the test ends. One per worker: a worker
 * runs one test at a time.
 */
export const extraBackendPort = () => Number(process.env.E2E_BACKEND_PORT ?? 17414) + 100 + WORKER

/** The worker this code runs in. Outside of a worker (config, global setup) this is 0. */
export const WORKER = Number(process.env.TEST_PARALLEL_INDEX ?? 0)
export const BACKEND_PORT = backendPort(WORKER)
export const WEB_PORT = webPort(WORKER)
/** The path under which the backend serves every route. */
export const API_PREFIX = '/api'

/** The base URL of a backend on a port: its routes are under `/api`. */
export const backendBase = (port: number, host = '127.0.0.1') =>
  `http://${host}:${port}${API_PREFIX}`

/**
 * The app reaches the backend of its worker as `/api` of its own origin; the app server passes it
 * on (see `web-server.ts`), as the reverse proxy does in production. Node talks to the backend
 * directly, on 127.0.0.1.
 */
export const BROWSER_BACKEND_URL = `http://localhost:${WEB_PORT}${API_PREFIX}`
export const BACKEND_URL = backendBase(BACKEND_PORT)

/** Test users of the throwaway e2e backend (passwords are generated into its config). */
export const USERS = {
  alice: { username: 'alice', password: 'alice-Passwort-ä', role: 'admin' },
  bob: { username: 'bob', password: 'bob-password', role: 'editor' },
  carol: { username: 'carol', password: 'carol-password', role: 'reader' },
} as const
export const E2E_USER = USERS.alice
