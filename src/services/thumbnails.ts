import { useApi } from '@/api'
import type { ResourceModel } from '@/api'

import { resourceKind } from './icons'
import { resourceObjectUrl } from './resourceUrls'

const cache = new Map<string, Promise<string>>()

/**
 * Object URL of a small preview of a resource, or null when there is none (not an image). Uses
 * the backend's thumbnails when it offers them, else the image itself. Cached per resource,
 * size and modification time.
 */
export function thumbnailUrl(resource: ResourceModel, size = 256): Promise<string> | null {
  if (resourceKind(resource) !== 'image') return null
  if (!resource.thumbnail) return resourceObjectUrl(resource.id)
  const key = `${resource.id} ${size} ${resource.modtime}`
  let url = cache.get(key)
  if (!url) {
    url = useApi()
      .getResourceThumbnail(resource.id, size)
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => resourceObjectUrl(resource.id))
    cache.set(key, url)
  }
  return url
}
