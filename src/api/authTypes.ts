/** Accounts, sessions and administration, see `docs/auth.md` in the backend repo. */

export type Role = 'admin' | 'editor' | 'reader'
export const ROLES: readonly Role[] = ['admin', 'editor', 'reader']

/** `GET /auth/status/`, public. */
export interface AuthStatus {
  setupRequired: boolean
  authDisabled: boolean
  passkeys: { enabled: boolean; rpId?: string }
  passwordPolicy: { minLength: number; maxLength: number }
  legacyBasicAuth?: boolean
}

export interface UserInfo {
  id: string
  username: string
  displayName: string
  role: Role
  color: string
  /** Hash of the profile picture, see `avatarUrl`; null without one, absent on older servers. */
  avatar?: string | null
  secondFactorSetupRequired?: boolean
  /** Number of passkeys, for the passkey step after a sign-in. Missing on older backends. */
  passkeyCount?: number
}

export interface SessionInfo {
  id: string
  type: 'cookie' | 'bearer'
  deviceName: string
  userAgent?: string
  ip?: string
  createdAt: string
  lastUsedAt?: string
  expiresAt: string
  idleExpiresAt: string
  current?: boolean
}

export interface SessionResponse {
  status: 'ok'
  user: UserInfo
  session: SessionInfo
}

export type SecondFactorMethod = 'totp' | 'recovery-code' | 'passkey'

interface SecondFactorRequired {
  status: 'second-factor-required'
  challenge: string
  methods: SecondFactorMethod[]
  expiresAt: string
}

export type LoginResponse = SessionResponse | SecondFactorRequired

/** A WebAuthn ceremony: `publicKey` goes to the browser as is. */
export interface PasskeyCeremony {
  ceremonyId: string
  publicKey: unknown
}

export type LinkKind = 'setup' | 'invite' | 'reset'

export interface LinkInspection {
  kind: LinkKind
  role?: Role
  note?: string | null
  username?: string
  displayName?: string
  resetSecondFactors?: boolean
  expiresAt: string
}

/** `GET /account/` */
export interface AccountInfo extends UserInfo {
  email?: string | null
  createdAt: string
  hasPassword: boolean
  totpEnabled: boolean
  recoveryCodesLeft: number
  passkeyCount: number
  secondFactorSetupRequired: boolean
  require2FA: boolean
  reauthenticatedUntil?: string | null
}

export interface AccountPatch {
  displayName?: string
  color?: string
  email?: string
  username?: string
}

export interface TotpEnrollment {
  secret: string
  otpauthUri: string
  expiresAt: string
}

export interface Passkey {
  id: string
  name: string
  createdAt: string
  lastUsedAt?: string | null
  backedUp?: boolean
  transports?: string[]
}

type UserStatus = 'active' | 'disabled' | 'deleted'

/** An entry of `GET /admin/users/`. */
export interface AdminUser extends UserInfo {
  email?: string | null
  status: UserStatus
  createdAt: string
  lastLoginAt?: string | null
  hasPassword: boolean
  totpEnabled: boolean
  passkeyCount: number
  sessionCount: number
}

export interface AdminUserPatch {
  role?: Role
  status?: 'active' | 'disabled'
  username?: string
  displayName?: string
  color?: string
  email?: string
}

export type LinkStatus = 'pending' | 'used' | 'expired' | 'revoked'

interface UserRef {
  id: string
  username: string
}

export interface LinkInfo {
  id: string
  kind: LinkKind
  role?: Role | null
  note?: string | null
  accountId?: string | null
  resetSecondFactors?: boolean
  createdBy?: UserRef | null
  createdAt: string
  expiresAt: string
  usedAt?: string | null
  usedBy?: UserRef | null
  revokedAt?: string | null
  status: LinkStatus
}

/** A newly created link: the token is only returned this once. */
export interface CreatedLink {
  link: LinkInfo
  token: string
  url: string | null
}

export interface InstanceSettings {
  require2FA: boolean
  /** People without an account may ask for an invite. Absent on older servers. */
  accessRequestsEnabled?: boolean
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired'

/** `name` and `message` are untrusted plain text: show them as text only. */
export interface AccessRequest {
  id: string
  name: string
  message: string
  status: AccessRequestStatus
  createdAt: string
  expiresAt: string
  documentId: string | null
  documentPath: string | null
  invitedByAccountId: string | null
  invitedByName: string | null
}

export interface CreatedAccessRequest {
  requestId: string
  /** Shown only once. */
  token: string
  status: AccessRequestStatus
  expiresAt: string
}

export interface AuditEvent {
  id: number
  time: string
  type: string
  actor?: UserRef | null
  target?: UserRef | null
  ip?: string
  userAgent?: string
  details?: Record<string, unknown> | null
}

export interface AuditPage {
  events: AuditEvent[]
  next: number | null
}

export interface AuditQuery {
  limit?: number
  before?: number
  type?: string
  account?: string
}

type DeviceLinkStatus = 'pending' | 'redeemed' | 'expired' | 'revoked'

/** A pairing link for the Android app (`docs/auth.md`, device pairing). */
export interface DeviceLink {
  id: string
  status: DeviceLinkStatus
  deviceName: string | null
  createdAt: string
  expiresAt: string
  redeemedAt?: string | null
  redeemedDeviceName?: string | null
  sessionId?: string | null
  revokedAt?: string | null
}

export interface CreatedDeviceLink {
  deviceLink: DeviceLink
  token: string
  expiresAt: string
  /** `{clientUrl}/connect#<payload>`, null when the backend has no `clientUrl`. */
  connectUrl: string | null
}

export type AppTokenScope = 'read' | 'write'

/** A long-lived token for scripts and agents (`docs/auth.md`, app token). */
export interface AppToken {
  id: string
  name: string
  scope: AppTokenScope
  createdAt: string
  lastUsedAt: string | null
  /** Null: never expires. For OAuth clients it moves 30 days ahead with each refresh. */
  expiresAt: string | null
  /** Set when an MCP client got this token by signing in with OAuth. */
  oauthClientId?: string
  /** The server the OAuth client may use, e.g. `https://wiki.example.com/api/mcp`. */
  resource?: string
  /** An OAuth grant without a fixed end: `expiresAt` moves 30 days ahead with each use. */
  slidingExpiry?: boolean
}

/** An MCP client asks for access (`GET /oauth/requests/{id}/`, `docs/oauth.md`). */
export interface OAuthRequest {
  id: string
  clientId: string
  /** Chosen by the client itself: a claim, not a verified name. */
  clientName: string
  /** Where the browser goes after the decision, with the code or the refusal. */
  redirectUri: string
  scope: AppTokenScope
  /** Only `read` for readers. */
  allowedScopes: AppTokenScope[]
  resource: string
  expiresAt: string
}

export interface CreatedAppToken {
  appToken: AppToken
  /** `mdp_…`; the server never shows it again. */
  token: string
}

/** `GET /server-info/`: public facts for onboarding screens. */
export interface ServerInfo {
  name: string
  version: string
  protocolVersion: number
  backendUrl: string | null
  wikiUrl: string | null
  webClientUrl: string | null
  setupRequired: boolean
  authDisabled: boolean
  passkeys: { enabled: boolean; rpId?: string }
  loginMethods: string[]
  require2FA: boolean
  /** Optional API features of this server, for example `access-requests`. */
  features?: string[]
}
