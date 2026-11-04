/**
 * How many test workers run at once. Each has its own backend with its own wiki and users, and its
 * own port of the app, so tests of different workers cannot see each other. At most 6: the extra
 * backends of single tests start at port 17420.
 */
export const WORKERS = Number(process.env.E2E_WORKERS ?? 4)

export const backendPort = (worker: number) =>
  Number(process.env.E2E_BACKEND_PORT ?? 17414) + worker
export const webPort = (worker: number) => Number(process.env.E2E_WEB_PORT ?? 4174) + worker

/** The worker this code runs in. Outside of a worker (config, global setup) this is 0. */
export const WORKER = Number(process.env.TEST_PARALLEL_INDEX ?? 0)
export const BACKEND_PORT = backendPort(WORKER)
export const WEB_PORT = webPort(WORKER)
/**
 * The browser reaches the backend as `localhost`, like the app (same site as the app, so the
 * session cookie is sent). Node talks to it on 127.0.0.1.
 */
export const BROWSER_BACKEND_URL = `http://localhost:${BACKEND_PORT}`
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

/** Test users of the throwaway e2e backend (passwords are generated into its config). */
export const USERS = {
  alice: { username: 'alice', password: 'alice-Passwort-ä', role: 'admin' },
  bob: { username: 'bob', password: 'bob-password', role: 'editor' },
  carol: { username: 'carol', password: 'carol-password', role: 'reader' },
} as const
export const E2E_USER = USERS.alice
