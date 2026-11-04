import { currentAccount } from './account'
import { accountStore, getOfflineStore, unownedStore } from './offlineStore'
import type { OfflineStore } from './offlineStore'

export interface LocalCopies {
  /** Where the copies of the current user live. */
  store: OfflineStore
  /** Records of older versions, whose owner only the server can tell. */
  unowned?: OfflineStore
}

const accounts = new Map<string, LocalCopies>()

/**
 * The stored copies for whoever is signed in now. Without a user (a server without login) there
 * are no accounts to keep apart, and copies have no owner.
 */
export function localCopies(): LocalCopies {
  const account = currentAccount()
  const raw = getOfflineStore()
  if (account === null) return { store: unownedStore(raw) }
  let copies = accounts.get(account)
  if (!copies) {
    copies = { store: accountStore(raw, account), unowned: unownedStore(raw) }
    accounts.set(account, copies)
  }
  return copies
}

/** All stores whose copies follow a move for the current user. */
export function movableCopies(): OfflineStore[] {
  const { store, unowned } = localCopies()
  return unowned ? [store, unowned] : [store]
}
