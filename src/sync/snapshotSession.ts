import { ref, shallowRef } from 'vue'

import { useApi } from '@/api'
import { describeError } from '@/stores/notify'

import type { AuthorRun, DocumentSession, Peer, SessionStatus, SessionUser } from './session'

/**
 * A read-only session that loads the document text once over REST. Used until live editing
 * (the Automerge websocket session) is available, and as a fallback.
 */
export function createSnapshotSession(documentId: string, message?: string): DocumentSession {
  let text = ''
  const status = ref<SessionStatus>({ connection: 'connecting', readOnly: true, unsynced: false })
  const listeners = new Set<(changes: { from: number; to: number; insert: string }[]) => void>()

  const ready = useApi()
    .getDocumentContent(documentId)
    .then((content) => {
      const before = text
      text = content
      for (const listener of listeners) listener([{ from: 0, to: before.length, insert: content }])
      status.value = { connection: 'snapshot', readOnly: true, unsynced: false, message }
    })
    .catch((error: unknown) => {
      status.value = {
        connection: 'closed',
        readOnly: true,
        unsynced: false,
        message: describeError(error),
      }
      throw error
    })

  return {
    status,
    peers: shallowRef<Peer[]>([]),
    authorship: shallowRef<AuthorRun[]>([]),
    me: shallowRef<SessionUser | null>(null),
    ready,
    getText: () => text,
    applyLocalChanges: () => {
      // read-only
    },
    setLocalSelections: () => {},
    onRemoteChanges(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => listeners.clear(),
  }
}
