import { ref, shallowRef } from 'vue'

import type {
  AuthorRun,
  DocumentSession,
  Peer,
  SessionStatus,
  SessionUser,
  TextChange,
  TextSelection,
} from '@/sync/session'
import { applyChanges } from '@/sync/session'

/** An in-memory DocumentSession for tests. */
export function createFakeSession(initial = '', options: { readOnly?: boolean } = {}) {
  let text = initial
  const listeners = new Set<(changes: readonly TextChange[]) => void>()
  const localChanges: TextChange[][] = []
  const selections: TextSelection[][] = []
  const status = ref<SessionStatus>({
    connection: 'online',
    readOnly: options.readOnly ?? false,
    unsynced: false,
  })
  const peers = shallowRef<Peer[]>([])
  const authorship = shallowRef<AuthorRun[]>([])
  const me = shallowRef<SessionUser | null>({ username: 'me', displayName: 'Ich', color: '#000' })

  const session: DocumentSession = {
    status,
    peers,
    authorship,
    me,
    ready: Promise.resolve(),
    getText: () => text,
    applyLocalChanges(changes) {
      localChanges.push([...changes])
      text = applyChanges(text, changes)
    },
    setLocalSelections(s) {
      selections.push([...s])
    },
    onRemoteChanges(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => listeners.clear(),
  }

  return {
    session,
    localChanges,
    selections,
    get text() {
      return text
    },
    /** Simulates an edit by another user. */
    remote(changes: TextChange[]) {
      text = applyChanges(text, changes)
      for (const listener of listeners) listener(changes)
    },
  }
}
