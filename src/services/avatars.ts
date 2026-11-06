import { useApi } from '@/api'

const cache = new Map<string, Promise<string>>()
const ready = new Map<string, string>()

/** Whom a picture belongs to, as the server lists users. */
export interface AvatarOwner {
  accountId?: string
  avatar?: string | null
}

function keyOf(owner: AvatarOwner): string | null {
  return owner.accountId && owner.avatar ? `${owner.accountId}/${owner.avatar}` : null
}

/**
 * Object URL of a profile picture, or null when the user has none or the server is too old to
 * name the account. Pictures need auth, so `<img src>` cannot point at the backend directly.
 * The hash changes with every new picture, so URLs are kept for the lifetime of the page.
 */
export function avatarUrl(owner: AvatarOwner): Promise<string> | null {
  const key = keyOf(owner)
  if (!key) return null
  let url = cache.get(key)
  if (!url) {
    url = useApi()
      .getAvatar(owner.accountId!, owner.avatar!)
      .then((blob) => {
        const object = URL.createObjectURL(blob)
        ready.set(key, object)
        return object
      })
    url.catch(() => cache.delete(key))
    cache.set(key, url)
  }
  return url
}

/** The object URL if the picture is already loaded, to draw it without a flash of the initials. */
export function loadedAvatarUrl(owner: AvatarOwner): string | undefined {
  const key = keyOf(owner)
  return key ? ready.get(key) : undefined
}

/** Forgets the pictures (on logout). */
export function clearAvatarUrls(): void {
  for (const url of ready.values()) URL.revokeObjectURL(url)
  ready.clear()
  cache.clear()
}
