import { readonly, ref } from 'vue'

import { readJson, remove, session, writeJson } from '@/services/storage'

const ID_KEY = 'mkdocseditor.instanceId'
const COLOR_KEY = 'mkdocseditor.instanceColor'

/** 16 random bytes as lower-case hex, the format of Automerge actor ids. */
export function randomHexId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

let id: string | null = null

/**
 * The id of this client instance (protocol section 6): one per tab, and the same after a reload,
 * so that a reload leaves no ghost. It is only in the storage while the page is gone, because
 * duplicating a tab copies the storage and the copy must become an instance of its own.
 */
export function instanceId(): string {
  if (id) return id
  id = readJson<string>(session(), ID_KEY) ?? randomHexId()
  remove(session(), ID_KEY)
  window.addEventListener('pagehide', () => writeJson(session(), ID_KEY, id))
  // back from the back/forward cache: the page lives on, without a new load
  window.addEventListener('pageshow', () => remove(session(), ID_KEY))
  return id
}

const color = ref<string | null>(readJson<string>(session(), COLOR_KEY))

/** The color of the cursor of this instance for the others, instead of the one of the account. */
export const instanceColor = readonly(color)

export function setInstanceColor(next: string | null): void {
  color.value = next
  if (next) writeJson(session(), COLOR_KEY, next)
  else remove(session(), COLOR_KEY)
}
