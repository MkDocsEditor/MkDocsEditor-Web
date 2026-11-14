import type { AppTokenScope } from '@/api'

/** Like the backend: 1 to 64 characters, no control characters. */
export function tokenNameRule(name: string): true | string {
  const trimmed = name.trim()
  if (trimmed === '' || [...trimmed].length > 64) return '1 to 64 characters'
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return 'No control characters'
  return true
}

export const SCOPE_CHOICES: { value: AppTokenScope; title: string }[] = [
  { value: 'write', title: 'Read and write' },
  { value: 'read', title: 'Read only' },
]

/** Days until the token expires; null: never. */
export const EXPIRY_CHOICES: { value: number | null; title: string }[] = [
  { value: 7, title: 'In 7 days' },
  { value: 30, title: 'In 30 days' },
  { value: 90, title: 'In 90 days' },
  { value: 365, title: 'In a year' },
  { value: null, title: 'Never' },
]
