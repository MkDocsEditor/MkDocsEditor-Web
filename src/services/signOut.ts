import { useAuthStore } from '@/stores/auth'
import { usePagesStore } from '@/stores/pages'
import { useTreeStore } from '@/stores/tree'
import { accountKey, wikiCopy } from '@/sync/wikiCopy'

import { clearRecentSearches } from './recentSearches'

/**
 * Signs out on purpose. This also removes what search and browsing keep on this device, because it
 * may be a shared one. Unsaved edits stay in the offline store for the next sign-in.
 */
export async function signOut(): Promise<void> {
  // read before the user is gone
  const copy = wikiCopy()
  const account = accountKey()
  await useAuthStore().logout()
  useTreeStore().reset()
  usePagesStore().reset()
  clearRecentSearches(account)
  await copy.clear()
}
