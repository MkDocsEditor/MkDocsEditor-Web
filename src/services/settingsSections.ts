import {
  mdiAccount,
  mdiAccountClock,
  mdiAccountGroup,
  mdiDevices,
  mdiEmailPlus,
  mdiHistory,
  mdiInformationOutline,
  mdiRobotOutline,
  mdiPaletteOutline,
  mdiPencilOutline,
  mdiServer,
  mdiShieldLock,
} from '@mdi/js'

/** The groups of the settings page, named like the Android app where it has the same thing. */
export type SettingsGroup = 'account' | 'browser' | 'admin' | 'about'

export const SETTINGS_SECTIONS = [
  { id: 'profile', title: 'Profile', icon: mdiAccount, group: 'account' },
  { id: 'security', title: 'Sign-in and security', icon: mdiShieldLock, group: 'account' },
  { id: 'sessions', title: 'Sessions', icon: mdiDevices, group: 'account' },
  { id: 'agents', title: 'AI agents and tokens', icon: mdiRobotOutline, group: 'account' },
  { id: 'editor', title: 'Editor', icon: mdiPencilOutline, group: 'browser' },
  { id: 'appearance', title: 'Appearance', icon: mdiPaletteOutline, group: 'browser' },
  { id: 'users', title: 'Users', icon: mdiAccountGroup, group: 'admin' },
  { id: 'invites', title: 'Invitations', icon: mdiEmailPlus, group: 'admin' },
  { id: 'requests', title: 'Access requests', icon: mdiAccountClock, group: 'admin' },
  { id: 'audit', title: 'Audit log', icon: mdiHistory, group: 'admin' },
  { id: 'server', title: 'Server', icon: mdiServer, group: 'admin' },
  { id: 'about', title: 'About', icon: mdiInformationOutline, group: 'about' },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']
export type SectionInfo = (typeof SETTINGS_SECTIONS)[number]

export const SETTINGS_GROUPS: { id: SettingsGroup; title: string }[] = [
  { id: 'account', title: 'Account' },
  { id: 'browser', title: 'This browser' },
  { id: 'admin', title: 'Administration' },
  { id: 'about', title: '' },
]

/** For the route: `/settings/profile` and so on. */
export const SECTION_PATTERN = SETTINGS_SECTIONS.map((s) => s.id).join('|')

export function sectionInfo(id: string | undefined): SectionInfo | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === id)
}

export function isAdminSection(id: string | undefined): boolean {
  return sectionInfo(id)?.group === 'admin'
}

export function isAccountSection(id: string | undefined): boolean {
  return sectionInfo(id)?.group === 'account'
}

/** Where the old `/admin/<tab>` addresses lead now. */
export const ADMIN_TAB_SECTIONS: Record<string, SettingsSection> = {
  users: 'users',
  invites: 'invites',
  requests: 'requests',
  audit: 'audit',
  settings: 'server',
}
