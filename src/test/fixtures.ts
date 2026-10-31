import type { AccountInfo, AuthStatus, SectionModel, SessionResponse, UserInfo } from '@/api'

/** A small wiki tree for tests. */
export function sampleTree(): SectionModel {
  return {
    type: 'section',
    id: 'root',
    name: 'docs',
    documents: [
      { type: 'document', id: 'd-index', name: 'index', filesize: 10, modtime: '', url: '' },
    ],
    resources: [{ type: 'resource', id: 'r-logo', name: 'logo.png', filesize: 2048, modtime: '' }],
    subsections: [
      {
        type: 'section',
        id: 's-rezepte',
        name: 'Rezepte',
        resources: [],
        subsections: [
          {
            type: 'section',
            id: 's-kuchen',
            name: 'Kuchen',
            subsections: [],
            resources: [],
            documents: [
              {
                type: 'document',
                id: 'd-apfel',
                name: 'Apfelkuchen',
                filesize: 100,
                modtime: '',
                url: 'Rezepte/Kuchen/Apfelkuchen/',
              },
            ],
          },
        ],
        documents: [
          {
            type: 'document',
            id: 'd-suppe',
            name: 'Kürbissuppe',
            filesize: 50,
            modtime: '',
            url: 'Rezepte/K%C3%BCrbissuppe/',
          },
        ],
      },
      {
        type: 'section',
        id: 's-urlaub',
        name: 'Urlaub',
        subsections: [],
        documents: [],
        resources: [],
      },
    ],
  }
}

export function authStatus(overrides: Partial<AuthStatus> = {}): AuthStatus {
  return {
    setupRequired: false,
    authDisabled: false,
    passkeys: { enabled: true, rpId: 'localhost' },
    passwordPolicy: { minLength: 10, maxLength: 256 },
    legacyBasicAuth: false,
    ...overrides,
  }
}

export function user(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 'u-anna',
    username: 'anna',
    displayName: 'Anna',
    role: 'admin',
    color: '#1971c2',
    secondFactorSetupRequired: false,
    ...overrides,
  }
}

export function sessionResponse(overrides: Partial<UserInfo> = {}): SessionResponse {
  return {
    status: 'ok',
    user: user(overrides),
    session: {
      id: 'sess-1',
      type: 'cookie',
      deviceName: 'Firefox auf Linux',
      createdAt: '2026-10-31T10:00:00Z',
      expiresAt: '2027-01-29T10:00:00Z',
      idleExpiresAt: '2026-11-30T10:00:00Z',
    },
  }
}

export function account(overrides: Partial<AccountInfo> = {}): AccountInfo {
  return {
    ...user(),
    email: '',
    createdAt: '2026-10-01T10:00:00Z',
    hasPassword: true,
    totpEnabled: false,
    recoveryCodesLeft: 0,
    passkeyCount: 0,
    secondFactorSetupRequired: false,
    require2FA: false,
    reauthenticatedUntil: null,
    ...overrides,
  }
}
