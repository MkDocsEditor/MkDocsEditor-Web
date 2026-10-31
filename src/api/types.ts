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
}

export interface ResourceModel {
  type: 'resource'
  id: string
  /** File name including the extension. */
  name: string
  filesize: number
  modtime: string
}

export interface SectionModel {
  type: 'section'
  id: string
  name: string
  subsections: SectionModel[]
  documents: DocumentModel[]
  resources: ResourceModel[]
}

export type TreeItem = SectionModel | DocumentModel | ResourceModel
export type ItemType = TreeItem['type']

export interface Credentials {
  username: string
  password: string
}

export interface WhoAmI {
  username: string
  displayName?: string
  role?: 'admin' | 'editor' | 'reader'
  color?: string
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

export interface TokenResponse {
  token: string
  expiresAt?: string
}
