import type {
  AccountInfo,
  AccountPatch,
  AdminUser,
  AdminUserPatch,
  AuditPage,
  AuditQuery,
  AuthStatus,
  CreatedDeviceLink,
  CreatedLink,
  DeviceLink,
  InstanceSettings,
  LinkInfo,
  LinkInspection,
  LoginResponse,
  Passkey,
  PasskeyCeremony,
  Role,
  SessionInfo,
  ServerInfo,
  SessionResponse,
  TotpEnrollment,
} from './authTypes'
import type { ApiClient } from './client'

/** The web client always uses cookie sessions; the token never reaches JavaScript. */
const COOKIE = { sessionType: 'cookie' } as const

/** Login, links, account and admin endpoints of `docs/auth.md`. */
export class AuthApi {
  constructor(readonly client: ApiClient) {}

  private get api(): ApiClient {
    return this.client
  }

  private get<T>(path: string, quiet401 = false): Promise<T> {
    return this.api.json<T>('GET', path, { quiet401 })
  }

  private send<T>(method: string, path: string, json: unknown = {}, quiet401 = false): Promise<T> {
    return this.api.json<T>(method, path, { json, quiet401 })
  }

  private del(path: string): Promise<void> {
    return this.api.json('DELETE', path)
  }

  // public

  status(): Promise<AuthStatus> {
    return this.get('/auth/status', true)
  }

  serverInfo(): Promise<ServerInfo> {
    return this.get('/server-info', true)
  }

  login(username: string, password: string): Promise<LoginResponse> {
    return this.send('POST', '/auth/login', { username, password, ...COOKIE }, true)
  }

  secondFactor(
    challenge: string,
    factor: { code: string } | { recoveryCode: string },
  ): Promise<SessionResponse> {
    return this.send('POST', '/auth/login/second-factor', { challenge, ...factor, ...COOKIE }, true)
  }

  /** Without a challenge: discoverable passkey login. With one: passkey as second factor. */
  passkeyLoginBegin(challenge?: string): Promise<PasskeyCeremony> {
    return this.send('POST', '/auth/passkey/login/begin', challenge ? { challenge } : {}, true)
  }

  passkeyLoginFinish(ceremonyId: string, credential: unknown): Promise<SessionResponse> {
    return this.send(
      'POST',
      '/auth/passkey/login/finish',
      { ceremonyId, credential, ...COOKIE },
      true,
    )
  }

  inspectLink(token: string): Promise<LinkInspection> {
    return this.send('POST', '/auth/link/inspect', { token }, true)
  }

  /** Setup and invite: `username` (+ `displayName`); reset: only the password. */
  redeemLink(
    token: string,
    fields: { username?: string; displayName?: string; password: string },
  ): Promise<SessionResponse> {
    return this.send('POST', '/auth/link/redeem', { token, ...fields, ...COOKIE }, true)
  }

  linkPasskeyBegin(
    token: string,
    fields: { username?: string; displayName?: string } = {},
  ): Promise<PasskeyCeremony> {
    return this.send('POST', '/auth/link/passkey/begin', { token, ...fields }, true)
  }

  linkPasskeyFinish(
    ceremonyId: string,
    credential: unknown,
    passkeyName?: string,
  ): Promise<SessionResponse> {
    return this.send(
      'POST',
      '/auth/link/passkey/finish',
      { ceremonyId, credential, passkeyName, ...COOKIE },
      true,
    )
  }

  // session

  logout(): Promise<void> {
    return this.api.json('POST', '/auth/logout', { quiet401: true })
  }

  reauth(fields: { password?: string; code?: string }): Promise<{ reauthenticatedUntil: string }> {
    return this.send('POST', '/auth/reauth', fields)
  }

  reauthPasskeyBegin(): Promise<PasskeyCeremony> {
    return this.send('POST', '/auth/reauth/passkey/begin')
  }

  reauthPasskeyFinish(
    ceremonyId: string,
    credential: unknown,
  ): Promise<{ reauthenticatedUntil: string }> {
    return this.send('POST', '/auth/reauth/passkey/finish', { ceremonyId, credential })
  }

  // account

  account(): Promise<AccountInfo> {
    return this.get('/account')
  }

  updateAccount(patch: AccountPatch): Promise<AccountInfo> {
    return this.send('PATCH', '/account', patch)
  }

  changePassword(newPassword: string, currentPassword?: string): Promise<void> {
    return this.send('PUT', '/account/password', { newPassword, currentPassword })
  }

  totpBegin(): Promise<TotpEnrollment> {
    return this.send('POST', '/account/totp')
  }

  totpConfirm(code: string): Promise<{ recoveryCodes: string[] }> {
    return this.send('POST', '/account/totp/confirm', { code })
  }

  totpDisable(): Promise<void> {
    return this.del('/account/totp')
  }

  regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
    return this.send('POST', '/account/recovery-codes')
  }

  passkeys(): Promise<Passkey[]> {
    return this.get('/account/passkeys')
  }

  passkeyAddBegin(): Promise<PasskeyCeremony> {
    return this.send('POST', '/account/passkeys/begin')
  }

  passkeyAddFinish(ceremonyId: string, credential: unknown, name?: string): Promise<Passkey> {
    return this.send('POST', '/account/passkeys/finish', { ceremonyId, credential, name })
  }

  renamePasskey(id: string, name: string): Promise<Passkey> {
    return this.send('PATCH', `/account/passkeys/${encodeURIComponent(id)}`, { name })
  }

  deletePasskey(id: string): Promise<void> {
    return this.del(`/account/passkeys/${encodeURIComponent(id)}`)
  }

  // device pairing (the Android app)

  createDeviceLink(deviceName?: string): Promise<CreatedDeviceLink> {
    return this.send('POST', '/account/device-links', deviceName ? { deviceName } : {})
  }

  deviceLink(id: string): Promise<DeviceLink> {
    return this.get(`/account/device-links/${encodeURIComponent(id)}`)
  }

  revokeDeviceLink(id: string): Promise<void> {
    return this.del(`/account/device-links/${encodeURIComponent(id)}`)
  }

  sessions(): Promise<SessionInfo[]> {
    return this.get('/account/sessions')
  }

  revokeSession(id: string): Promise<void> {
    return this.del(`/account/sessions/${encodeURIComponent(id)}`)
  }

  revokeOtherSessions(): Promise<{ revoked: number }> {
    return this.send('POST', '/account/sessions/revoke-others')
  }

  // admin

  users(): Promise<AdminUser[]> {
    return this.get('/admin/users')
  }

  updateUser(id: string, patch: AdminUserPatch): Promise<AdminUser> {
    return this.send('PATCH', `/admin/users/${encodeURIComponent(id)}`, patch)
  }

  deleteUser(id: string): Promise<void> {
    return this.del(`/admin/users/${encodeURIComponent(id)}`)
  }

  revokeUserSessions(id: string): Promise<{ revoked: number }> {
    return this.send('POST', `/admin/users/${encodeURIComponent(id)}/sessions/revoke`)
  }

  createResetLink(
    id: string,
    options: { expiresInMinutes?: number; resetSecondFactors?: boolean },
  ): Promise<CreatedLink> {
    return this.send('POST', `/admin/users/${encodeURIComponent(id)}/reset-link`, options)
  }

  invites(): Promise<LinkInfo[]> {
    return this.get('/admin/invites')
  }

  async createInvite(options: {
    role: Role
    expiresInHours?: number
    note?: string
  }): Promise<CreatedLink> {
    const created = await this.send<{ invite: LinkInfo; token: string; url: string | null }>(
      'POST',
      '/admin/invites',
      options,
    )
    return { link: created.invite, token: created.token, url: created.url }
  }

  revokeInvite(id: string): Promise<void> {
    return this.del(`/admin/invites/${encodeURIComponent(id)}`)
  }

  resetLinks(): Promise<LinkInfo[]> {
    return this.get('/admin/reset-links')
  }

  revokeResetLink(id: string): Promise<void> {
    return this.del(`/admin/reset-links/${encodeURIComponent(id)}`)
  }

  settings(): Promise<InstanceSettings> {
    return this.get('/admin/settings')
  }

  updateSettings(patch: Partial<InstanceSettings>): Promise<InstanceSettings> {
    return this.send('PATCH', '/admin/settings', patch)
  }

  audit(query: AuditQuery = {}): Promise<AuditPage> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value))
    }
    const search = params.toString()
    return this.get(`/admin/audit${search ? `?${search}` : ''}`)
  }
}
