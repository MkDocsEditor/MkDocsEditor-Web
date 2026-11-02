export interface PageEventHandlers {
  /** The page may have slept, or the network changed: time to check the connection. */
  onWake(): void
  /** The page went to the background, where timers are throttled. */
  onHidden?(): void
  /** The browser reports that the network is gone. It can be wrong (a server on localhost). */
  onOffline?(): void
}

/**
 * Timers of a background tab barely run and those of a frozen tab do not run at all, so the
 * page itself has to say when it is back. Returns the function that stops watching.
 */
export function watchPage(handlers: PageEventHandlers): () => void {
  const { onWake, onHidden, onOffline } = handlers
  const onVisibility = () => {
    if (globalThis.document?.visibilityState === 'visible') onWake()
    else onHidden?.()
  }
  const onOfflineEvent = () => onOffline?.()
  globalThis.document?.addEventListener('visibilitychange', onVisibility)
  globalThis.document?.addEventListener('resume', onWake)
  globalThis.addEventListener?.('pageshow', onWake)
  globalThis.addEventListener?.('focus', onWake)
  globalThis.addEventListener?.('online', onWake)
  globalThis.addEventListener?.('offline', onOfflineEvent)
  return () => {
    globalThis.document?.removeEventListener('visibilitychange', onVisibility)
    globalThis.document?.removeEventListener('resume', onWake)
    globalThis.removeEventListener?.('pageshow', onWake)
    globalThis.removeEventListener?.('focus', onWake)
    globalThis.removeEventListener?.('online', onWake)
    globalThis.removeEventListener?.('offline', onOfflineEvent)
  }
}
