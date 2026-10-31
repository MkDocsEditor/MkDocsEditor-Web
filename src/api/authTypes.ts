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

export interface SecondFactorRequired {
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

export type UserStatus = 'active' | 'disabled' | 'deleted'

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

export interface UserRef {
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
