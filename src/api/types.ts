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
  /** The page name as MkDocs shows it (backends with `page-meta`); see `pageTitle`. */
  title?: string
  /** The front matter as the backend read it (backends with `page-meta`). */
  meta?: ServerPageMeta
}

/** `meta` of a document: what its front matter says, `null` or empty where it says nothing. */
export interface ServerPageMeta {
  title: string | null
  description: string | null
  icon: string | null
  status: string | null
  tags: string[]
  searchExclude: boolean
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

type ReferenceKind = 'link' | 'image' | 'definition' | 'html'

/** One reference in a document (`docs/references.md` section 4). */
interface Reference {
  kind: ReferenceKind
  /** 1-based line and column. */
  line: number
  column: number
  /** As written, including `?query` and `#anchor`. */
  destination: string
  anchor: string
  status: 'ok' | 'broken'
  target: ItemRef | null
  reason?: 'not-found' | 'outside-docs'
  /** The resolved path that does not exist (broken only). */
  path?: string
  /** The moved item behind a broken path, and the destination that would fix it. */
  movedTo?: ItemRef
  suggestedDestination?: string
}

/** A reference to an item from a document ("used by"). */
export interface Backlink {
  source: ItemRef
  kind: ReferenceKind
  line: number
  column: number
  destination: string
  anchor: string
  target: ItemRef
  /** Section backlinks: the source is inside the section and moves along. */
  internal: boolean
}

export interface BrokenReference extends Reference {
  source: ItemRef
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
interface LineEdit {
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
  /** Hash of the profile picture, see `avatarUrl`; null without one, absent on older servers. */
  avatar?: string | null
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

interface RevisionAuthor {
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

/** Someone named on the dashboard, with the current name, colour and picture. */
export interface ActivityPerson {
  /** Absent for the server itself and for changes on disk. */
  accountId?: string
  username?: string
  displayName: string
  color: string
  avatar: string | null
}

/** A pinned page (`GET /pins/`). */
export interface Pin {
  documentId: string
  /** Relative to the docs folder, e.g. `guide/setup.md`. */
  path: string
  /** Without `.md`, as in the tree. */
  name: string
  /** The page name as MkDocs shows it (backends with `page-meta`). */
  title?: string
  pinnedBy: ActivityPerson
  pinnedAt: string
}

/** Family pins are for everyone (set by editors and admins), personal ones for this account. */
export type PinScope = 'family' | 'personal'

export interface Pins {
  family: Pin[]
  personal: Pin[]
}

/** One change in the feed (`GET /feed/`). An editing session is one entry. */
export interface FeedEntry {
  id: string
  /** The last change of the entry. */
  time: string
  kind: 'edited' | 'created' | 'moved' | 'deleted'
  itemType: 'document' | 'section'
  /** Only for a page that still exists at `path`: its current id. Folders are found by path. */
  documentId?: string
  path: string
  /** The page name of the document at `path`; null when there is none (`page-meta`). */
  title?: string | null
  /** Only for `moved`. */
  oldPath?: string
  authors: ActivityPerson[]
  /** Only for `edited`: the headings of the sections the change touched, in document order. */
  summary?: { linesAdded: number; linesRemoved: number; headings: string[] }
}

export interface FeedPage {
  entries: FeedEntry[]
  /** Cursor for the next (older) page, null at the end. */
  next: string | null
}

export type * from './authTypes'
