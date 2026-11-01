import { ApiError, useApi } from '@/api'
import type { Backlink, ItemRef, ItemType } from '@/api'

/** Backlinks grouped by the page they come from. */
export interface BacklinkSource {
  source: ItemRef
  /** The references on that page, in text order. */
  links: Backlink[]
}

export function groupBySource(backlinks: readonly Backlink[]): BacklinkSource[] {
  const groups = new Map<string, BacklinkSource>()
  for (const link of backlinks) {
    const group = groups.get(link.source.id)
    if (group) group.links.push(link)
    else groups.set(link.source.id, { source: link.source, links: [link] })
  }
  return [...groups.values()]
}

export function linesLabel(links: readonly Backlink[]): string {
  const lines = [...new Set(links.map((l) => l.line))]
  return lines.length === 1 ? `line ${lines[0]}` : `lines ${lines.join(', ')}`
}

/**
 * The pages that link to an item from outside it (for a folder: not its own pages), or null
 * when the backend cannot tell (older backend, offline).
 */
export async function externalBacklinks(type: ItemType, id: string): Promise<Backlink[] | null> {
  try {
    return (await useApi().getBacklinks(type, id)).filter((l) => !l.internal)
  } catch (error) {
    if (error instanceof ApiError) return null
    throw error
  }
}

/** "3 pages link to this file; those links will break." or '' */
export function breakWarning(backlinks: readonly Backlink[] | null, what: string): string {
  if (!backlinks || backlinks.length === 0) return ''
  const pages = new Set(backlinks.map((l) => l.source.id)).size
  return `${pages === 1 ? '1 page links' : `${pages} pages link`} to this ${what}; ${
    backlinks.length === 1 ? 'that link' : 'those links'
  } will break.`
}
