import { useAuthStore } from '@/stores/auth'

/**
 * Who is signed in now; null on a server without login. This is the one place where `sync` reads a
 * store: local data has to stay apart per account, and everything else here is free of Pinia.
 */
export function currentAccount(): string | null {
  const user = useAuthStore().user
  return user ? (user.id ?? user.username) : null
}

/** `currentAccount` for use in storage keys; empty on a server without login. */
export function accountKey(): string {
  return encodeURIComponent(currentAccount() ?? '')
}
