import { useApi } from '@/api'
import type { ResourceModel } from '@/api'
import type { Progress } from '@/api/client'

/** Per resource, its object URL per version. */
const cache = new Map<string, Map<string, Promise<string>>>()

/** Changes when the file's content may have changed (replaced by an upload or on disk). */
export function resourceVersion(resource: Pick<ResourceModel, 'modtime' | 'filesize'>): string {
  return `${resource.modtime} ${resource.filesize}`
}

/**
 * Object URL for a resource's content. Resources need auth, so `<img src>` cannot point at the
 * backend directly. URLs are cached per resource and version (modification time and size), so a
 * replaced file is downloaded again. URLs of older versions stay valid until `clear`: something
 * may still show or download them. `onProgress` only hears of a download that starts with this
 * call.
 */
export function resourceObjectUrl(
  resource: Pick<ResourceModel, 'id' | 'modtime' | 'filesize'>,
  onProgress?: Progress,
): Promise<string> {
  const { id } = resource
  const version = resourceVersion(resource)
  let versions = cache.get(id)
  if (!versions) cache.set(id, (versions = new Map()))
  let url = versions.get(version)
  if (!url) {
    url = useApi()
      .getResourceContent(id, onProgress)
      .then((blob) => URL.createObjectURL(blob))
    url.catch(() => versions.delete(version))
    versions.set(version, url)
  }
  return url
}

/** Forgets cached URLs (on logout). */
export function clearResourceUrls(id?: string): void {
  const ids = id === undefined ? [...cache.keys()] : [id]
  for (const key of ids) {
    for (const url of cache.get(key)?.values() ?? []) {
      void url.then((u) => URL.revokeObjectURL(u)).catch(() => undefined)
    }
    cache.delete(key)
  }
}
