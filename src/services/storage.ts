/** Safe wrappers around Web Storage: private windows or blocked storage must not break the app. */

export function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // ignore, the value just won't survive a reload
  }
}

export function remove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // ignore
  }
}

export function local(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function session(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}
