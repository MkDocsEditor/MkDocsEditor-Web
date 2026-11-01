/** Data model of the MkDocsEditor backend, see `openapi-description.yaml` in the backend repo. */

export interface DocumentModel {
  type: 'document'
  id: string
  /** File name without the `.md` extension. */
  name: string
  filesize: number
  modtime: string
  /** Path of the rendered page on the MkDocs site, relative to the site root, e.g. `Foo/Bar/`. */
  url: string
  /** Path relative to the docs folder, e.g. `Foo/Bar.md` (newer backends). */
  path?: string
}

/** Kind of a resource, for icons and pickers (`docs/references.md` section 9). */
export type ResourceKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'other'

export interface ResourceModel {
  type: 'resource'
  id: string
  /** File name including the extension. */
  name: string
  filesize: number
  modtime: string
  /** Newer backends: path relative to the docs folder, MIME type, kind, thumbnail support. */
  path?: string
  mimeType?: string
  kind?: ResourceKind
  thumbnail?: boolean
}

export interface SectionModel {
  type: 'section'
  id: string
  name: string
  /** Newer backends: path relative to the docs folder (`""` for the root). */
  path?: string
  /** Newer backends: id of the index document (`index.md`, else `README.md`), or `""`. */
  index?: string
  subsections: SectionModel[]
  documents: DocumentModel[]
  resources: ResourceModel[]
}

export type TreeItem = SectionModel | DocumentModel | ResourceModel
export type ItemType = TreeItem['type']

/** A short description of an item (`docs/references.md` section 4). */
export interface ItemRef {
  type: ItemType
  id: string
  /** Path relative to the docs folder. */
  path: string
  name: string
}

/** An item whose id changed through a move or rename (`docs/references.md` section 5). */
export interface MovedItem {
  type: ItemType
  oldId: string
  newId: string
  oldPath: string
  newPath: string
}

/** `POST /move/` (`docs/references.md` section 5). */
export interface MoveRequest {
  type: ItemType
  id: string
  /** Target section; leave out to rename in place. */
  parent?: string
  /** New name (documents without `.md`); leave out to keep the name. */
  name?: string
  dryRun?: boolean
  updateReferences?: boolean
}

/** A changed line: 1-based number in the text before the move. */
export interface LineEdit {
  line: number
  before: string
  after: string
}

export interface MoveResult {
  dryRun: boolean
  type: ItemType
  oldId: string
  newId: string
  oldPath: string
  newPath: string
  /** The item after the move (absent in a dry run). */
  item?: TreeItem
  moved: MovedItem[]
  documents: {
    documentId: string
    newDocumentId: string
    path: string
    newPath: string
    edits: LineEdit[]
  }[]
  config: (LineEdit & { file: string })[]
  commit?: string
}

/** `GET /moved/{id}/`: where an old id points now. */
export interface MovedTo {
  oldId: string
  type: ItemType
  item: ItemRef
  movedAt: string
}

/** `GET /auth/whoami/` */
export interface WhoAmI {
  id?: string
  username: string
  displayName?: string
  role?: 'admin' | 'editor' | 'reader'
  color?: string
  authMethod?: 'session' | 'app-token' | 'basic' | 'anonymous'
  secondFactorSetupRequired?: boolean
  sessionId?: string
}

/** A websocket ticket: single use, valid for 60 seconds. */
export interface WsTicket {
  ticket: string
  expiresAt?: string
}

/** Binding of an Automerge actor id to a user. Pseudo users `:disk` and `:server`. */
export interface ActorInfo {
  actorId: string
  username: string
  displayName?: string
  color?: string
}

export interface AuthorshipResponse {
  heads: string[]
  /** Positions in Unicode code points, `end` exclusive. */
  runs: { start: number; end: number; actorId: string; username: string }[]
}

export interface RevisionAuthor {
  name: string
  email: string
  /** Empty for authors who are not configured users. */
  username: string
}

/** A git commit that touched a document (`GET /document/{id}/history/`). */
export interface Revision {
  revision: string
  /** ISO timestamp */
  time: string
  author: RevisionAuthor
  coAuthors: RevisionAuthor[] | null
  message: string
  /** The file's path in that commit (history follows renames). */
  path: string
}

export type * from './authTypes'
