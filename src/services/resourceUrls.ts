import { useApi } from '@/api'
import type { Progress } from '@/api/client'

const cache = new Map<string, Promise<string>>()

/**
 * Object URL for a resource's content. Resources need auth, so `<img src>` cannot point at the
 * backend directly. URLs are cached for the lifetime of the page (or until `clear`). `onProgress`
 * only hears of a download that starts with this call.
 */
export function resourceObjectUrl(id: string, onProgress?: Progress): Promise<string> {
  let url = cache.get(id)
  if (!url) {
    url = useApi()
      .getResourceContent(id, onProgress)
      .then((blob) => URL.createObjectURL(blob))
    url.catch(() => cache.delete(id))
    cache.set(id, url)
  }
  return url
}

/** Forgets cached URLs (after an upload replaced a file, or on logout). */
export function clearResourceUrls(id?: string): void {
  const entries = id === undefined ? [...cache.entries()] : [[id, cache.get(id)] as const]
  for (const [key, url] of entries) {
    void url?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined)
    cache.delete(key)
  }
}
