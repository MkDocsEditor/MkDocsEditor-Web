import type { DocumentSession } from './session'
import { createSnapshotSession } from './snapshotSession'

/**
 * Creates the session for a document. Live collaborative editing (Automerge over the backend's
 * document websocket, see docs/sync-protocol.md in the backend repo) plugs in here; until it is
 * enabled the editor shows a read-only snapshot.
 */
export function createDocumentSession(documentId: string): DocumentSession {
  return createSnapshotSession(
    documentId,
    'Nur lesen: Gemeinsames Bearbeiten wird gerade eingebaut.',
  )
}

export type * from './session'
