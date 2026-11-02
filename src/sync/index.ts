import { useApi } from '@/api'

import { loadAutomerge } from './automerge'
import { createAutomergeSession } from './automergeSession'
import { localCopies } from './localCopies'
import type { DocumentSession } from './session'

export interface SessionOptions {
  /** The server renamed the document (or a folder above it); the session follows by itself. */
  onRenamed?: (newDocumentId: string) => void
}

/**
 * Creates the live session for a document: Automerge over the backend's document websocket
 * (protocol v1, see docs/sync-protocol.md in MkDocsEditor-Backend), with an offline copy per
 * account in IndexedDB.
 */
export function createDocumentSession(
  documentId: string,
  options: SessionOptions = {},
): DocumentSession {
  return createAutomergeSession({
    documentId,
    automerge: loadAutomerge(),
    api: useApi(),
    ...localCopies(),
    onRenamed: options.onRenamed,
    clientName: `MkDocsEditor-Web/${import.meta.env.VITE_APP_VERSION ?? 'dev'}`,
  })
}

export type * from './session'
