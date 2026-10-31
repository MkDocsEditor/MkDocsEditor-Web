export const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 17414)
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4174)

/** Test users of the throwaway e2e backend (passwords are generated into its config). */
export const USERS = {
  alice: { username: 'alice', password: 'alice-Passwort-ä', role: 'admin' },
  bob: { username: 'bob', password: 'bob-password', role: 'editor' },
  carol: { username: 'carol', password: 'carol-password', role: 'reader' },
} as const
export const E2E_USER = USERS.alice
