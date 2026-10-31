import { getConfig } from './config'

/** Link to the rendered page on the MkDocs site, or null when no wiki URL is configured. */
export function wikiPageUrl(subUrl: string, wikiUrl = getConfig().wikiUrl): string | null {
  if (!wikiUrl) return null
  const path = subUrl.replace(/^\/+/, '')
  return `${wikiUrl.replace(/\/+$/, '')}/${path}`
}
