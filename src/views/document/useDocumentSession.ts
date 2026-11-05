import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { createDocumentSession } from '@/sync'
import type { DocumentSession } from '@/sync'

/**
 * The live session of the page `id` points at: a new one for every page, closed when leaving. A
 * rename on the server is the exception: the session follows by itself and only the route changes.
 */
export function useDocumentSession(id: () => string, onRenamed: (newId: string) => void) {
  const session = shallowRef<DocumentSession | null>(null)
  const text = ref('')
  const ready = ref(false)

  /** Set while following a server-side rename: the session already moved to the new id. */
  let renamedTo: string | null = null

  watch(
    id,
    (current) => {
      if (current === renamedTo) {
        renamedTo = null
        return
      }
      session.value?.close()
      const next = createDocumentSession(current, {
        onRenamed: (newId) => {
          renamedTo = newId
          onRenamed(newId)
        },
      })
      session.value = next
      ready.value = false
      text.value = next.getText()
      next.ready
        .then(() => {
          if (session.value === next) {
            text.value = next.getText()
            ready.value = true
          }
        })
        .catch(() => {
          // status.message is shown
        })
    },
    { immediate: true },
  )
  onBeforeUnmount(() => session.value?.close())

  const status = computed(() => session.value?.status.value)
  const peers = computed(() => session.value?.peers.value ?? [])
  const ghosts = computed(() => session.value?.ghosts.value ?? [])
  const presenceKnown = computed(() => session.value?.presenceKnown.value ?? false)
  /** Online users: distinct usernames (one user can have several tabs or devices). */
  const onlineUsers = computed(() => {
    const seen = new Map<string, { name: string; color: string; accountId?: string }>()
    for (const peer of peers.value) {
      if (!seen.has(peer.username))
        seen.set(peer.username, {
          name: peer.displayName || peer.username,
          color: peer.color,
          accountId: peer.accountId,
        })
    }
    return [...seen.values()]
  })

  return { session, text, ready, status, peers, ghosts, presenceKnown, onlineUsers }
}
