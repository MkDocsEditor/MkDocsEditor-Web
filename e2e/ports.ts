export const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 17414)
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4174)
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
