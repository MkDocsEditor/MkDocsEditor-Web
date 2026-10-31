/** Validation of section, document and resource names (they become file and folder names). */

const FORBIDDEN = /[/\\:*?"<>|]/

export function validateName(name: string): true | string {
  const trimmed = name.trim()
  if (trimmed === '') return 'Please enter a name.'
  if (trimmed === '.' || trimmed === '..') return 'This name is not allowed.'
  if (trimmed.startsWith('.')) return 'The name must not start with a dot.'
  if (FORBIDDEN.test(trimmed)) return 'These characters are not allowed: / \\ : * ? " < > |'
  return true
}

/** Document names are shown and sent without the `.md` extension. */
export function stripMarkdownExtension(name: string): string {
  return name.trim().replace(/\.md$/i, '')
}

/** Up to two initials for an avatar: "Anna Müller" gives "AM". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => [...p][0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
