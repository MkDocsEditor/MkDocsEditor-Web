import type { TreeItem } from '@/api'
import { resourceKind } from '@/services/icons'
import { linkDestination } from '@/services/linkPath'
import type { useTreeStore } from '@/stores/tree'

/** Link text without characters that would end it. */
export function escapeLinkText(text: string): string {
  return text.replace(/([[\]\\])/g, '\\$1')
}

/** URLs typed by hand: spaces and parentheses would end the destination. */
export function cleanUrl(url: string): string {
  return url.trim().replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

/**
 * The default text of a link to an item (like the backend's `GET /link/`): the name, without
 * the extension for an embedded image's alt text.
 */
export function defaultLinkText(item: TreeItem, embedded = false): string {
  return embedded ? item.name.replace(/\.[^.]+$/, '') : item.name
}

/**
 * Markdown for a link from the document `fromId` to `item`: `![alt](dest)` for images (unless
 * `asLink`), `[text](dest)` otherwise.
 */
export function markdownLink(
  tree: ReturnType<typeof useTreeStore>,
  fromId: string,
  item: TreeItem,
  options: { text?: string; anchor?: string; asLink?: boolean } = {},
): string {
  const destination = linkDestination(tree.path(fromId), tree.linkTarget(item), options.anchor)
  const image = !options.asLink && item.type === 'resource' && resourceKind(item) === 'image'
  const text = escapeLinkText(options.text?.trim() || defaultLinkText(item, image))
  return `${image ? '!' : ''}[${text}](${destination})`
}
