import { ref, shallowRef } from 'vue'

import type {
  AuthorRun,
  DocumentSession,
  Ghost,
  Peer,
  SessionStatus,
  SessionUser,
  TextChange,
  TextRange,
  TextSelection,
  WrittenRange,
} from '@/sync/session'
import { applyChanges } from '@/sync/session'

/** An in-memory DocumentSession for tests. */
export function createFakeSession(initial = '', options: { readOnly?: boolean } = {}) {
  let text = initial
  const listeners = new Set<
    (changes: readonly TextChange[], written: () => readonly WrittenRange[]) => void
  >()
  const localChanges: TextChange[][] = []
  const selections: TextSelection[][] = []
  const viewports: (TextRange | null)[] = []
  const colors: (string | null)[] = []
  const status = ref<SessionStatus>({
    connection: 'online',
    readOnly: options.readOnly ?? false,
    unsynced: false,
  })
  const peers = shallowRef<Peer[]>([])
  const ghosts = shallowRef<Ghost[]>([])
  const presenceKnown = ref(true)
  const authorship = shallowRef<AuthorRun[]>([])
  const me = shallowRef<SessionUser | null>({ username: 'me', displayName: 'Ich', color: '#000' })

  const session: DocumentSession = {
    status,
    lastPositionOf: () => null,
    peers,
    ghosts,
    presenceKnown,
    authorship,
    me,
    ready: Promise.resolve(),
    getText: () => text,
    sharedRevision: () => 'r1',
    applyLocalChanges(changes) {
      localChanges.push([...changes])
      text = applyChanges(text, changes)
    },
    setLocalSelections(s) {
      selections.push([...s])
    },
    setLocalViewport(viewport) {
      viewports.push(viewport)
    },
    setLocalColor(color) {
      colors.push(color)
    },
    onRemoteChanges(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => listeners.clear(),
  }

  return {
    session,
    /** Writable, unlike `session.status`. */
    status,
    localChanges,
    selections,
    viewports,
    colors,
    get text() {
      return text
    },
    /** Simulates an edit by another user; `written` is the text they inserted, by writer. */
    remote(changes: TextChange[], written: WrittenRange[] = []) {
      text = applyChanges(text, changes)
      for (const listener of listeners) listener(changes, () => written)
    },
  }
}
