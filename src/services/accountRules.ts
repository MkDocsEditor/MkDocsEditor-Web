/** Form checks matching the backend's rules (`docs/auth.md` sections 2 and 3). */

/** Vuetify sets fields to null on form reset. */
export type Rule = (value: string | null) => true | string

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/

export const usernameRule: Rule = (value) =>
  USERNAME.test((value ?? '').trim()) ||
  '1 to 32 characters: letters, digits, dot, dash, underscore; starting with a letter or digit'

export const displayNameRule: Rule = (value) =>
  [...(value ?? '').trim()].length <= 64 || 'At most 64 characters'

/** Length in code points after NFKC normalization, like the backend counts. */
export function passwordLength(value: string | null): number {
  return [...(value ?? '').normalize('NFKC')].length
}

export function passwordRule(policy: { minLength: number; maxLength: number }): Rule {
  return (value) => {
    const length = passwordLength(value)
    if (length < policy.minLength) return `At least ${policy.minLength} characters`
    if (length > policy.maxLength) return `At most ${policy.maxLength} characters`
    return true
  }
}

export function sameAsRule(other: () => string): Rule {
  return (value) => (value ?? '') === (other() ?? '') || 'The passwords do not match'
}

export const colorRule: Rule = (value) =>
  /^#[0-9a-fA-F]{6}$/.test(value ?? '') || 'A colour like #1971c2'

/** A 6-digit TOTP code, spaces allowed. */
export const totpRule: Rule = (value) =>
  /^\d{6}$/.test((value ?? '').replace(/\s/g, '')) || '6 digits from the app'

/** Formats an ISO time, for example "Oct 31, 2026, 2:05 PM". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '–'
  return date.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  reader: 'Reader',
}

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role]) || role || '–'
}
