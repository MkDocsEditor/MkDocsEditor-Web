/** Validation of section, document and resource names (they become file and folder names). */

const FORBIDDEN = /[/\\:*?"<>|]/

export function validateName(name: string): true | string {
  const trimmed = name.trim()
  if (trimmed === '') return 'Bitte einen Namen eingeben.'
  if (trimmed === '.' || trimmed === '..') return 'Dieser Name ist nicht erlaubt.'
  if (trimmed.startsWith('.')) return 'Der Name darf nicht mit einem Punkt anfangen.'
  if (FORBIDDEN.test(trimmed)) return 'Diese Zeichen sind nicht erlaubt: / \\ : * ? " < > |'
  return true
}

/** Document names are shown and sent without the `.md` extension. */
export function stripMarkdownExtension(name: string): string {
  return name.trim().replace(/\.md$/i, '')
}
