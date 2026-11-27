import { useApi } from '@/api'

/**
 * Opens a resource in a new tab, straight from the backend. The browser sends the session cookie
 * with it (the backend is same-site), so the tab gets the file itself: its type from the server
 * (an SVG is `image/svg+xml`), the server's content security policy (scripts in an SVG do not
 * run), and a URL to come back to. An object URL instead had no name and ran as a page of this
 * app.
 */
export function openResource(id: string): void {
  const url = useApi().url(`/resource/${encodeURIComponent(id)}/content/`)
  const tab = window.open(url, '_blank')
  // a popup blocker: here instead
  if (!tab) window.location.href = url
  else tab.opener = null
}
