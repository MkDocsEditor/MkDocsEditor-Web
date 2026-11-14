import type { DocumentChanges } from '@/api'

/** "alice and bob via Claude Code": who changed a page, with the agents they used. */
export function describeChangers(authors: DocumentChanges['authors']): string {
  const names = authors.map((author) =>
    author.agents.length > 0
      ? `${author.displayName} via ${author.agents.join(', ')}`
      : author.displayName,
  )
  if (names.length === 0) return 'someone'
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
