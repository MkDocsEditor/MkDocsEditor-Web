/**
 * What the "Connect an AI agent" page shows to copy: the MCP endpoint and ready-made snippets
 * for Claude Code, other MCP clients and curl, with the URL and token filled in.
 */

/** The MCP endpoint of the backend: `https://wiki.example.com/api/mcp`. */
export function mcpUrl(backendUrl: string): string {
  return `${backendUrl.replace(/\/+$/, '')}/mcp`
}

/** Single quotes for a POSIX shell, also around values with spaces or `$`. */
export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * `claude mcp add` for Claude Code. Without a token for clients that sign in with OAuth;
 * `user`: for all projects of this user instead of the current one.
 */
export function claudeCommand(url: string, token?: string, user = false): string {
  const parts = ['claude mcp add --transport http']
  if (user) parts.push('--scope user')
  parts.push('wiki', shellQuote(url))
  if (token) parts.push('--header', shellQuote(`Authorization: Bearer ${token}`))
  return parts.join(' ')
}

/** The `mcpServers` config of Claude Desktop, Cursor and most other MCP clients. */
export function mcpJson(url: string, token: string): string {
  const config = {
    mcpServers: {
      wiki: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } },
    },
  }
  return JSON.stringify(config, null, 2)
}

/** Reads a page's markdown with the REST API. */
export function curlRead(backendUrl: string, token: string, documentId = 'DOCUMENT_ID'): string {
  return [
    `curl -H ${shellQuote(`Authorization: Bearer ${token}`)} \\`,
    `  ${shellQuote(`${backendUrl}/document/${documentId}/content/`)}`,
  ].join('\n')
}

/**
 * Replaces text in a page with the REST API: each `old` must occur exactly once. The edit goes
 * live into the open editors, like typing.
 */
export function curlEdit(backendUrl: string, token: string, documentId = 'DOCUMENT_ID'): string {
  const body = JSON.stringify({ edits: [{ old: 'old text', new: 'new text' }] })
  return [
    `curl -X POST -H ${shellQuote(`Authorization: Bearer ${token}`)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d ${shellQuote(body)} \\`,
    `  ${shellQuote(`${backendUrl}/document/${documentId}/edits/`)}`,
  ].join('\n')
}

/** The OS of this device, for the default name of a token: "Claude Code on Linux". */
export function deviceName(userAgent: string): string {
  if (/android/i.test(userAgent)) return 'Android'
  if (/iphone|ipad/i.test(userAgent)) return 'iOS'
  if (/cros/i.test(userAgent)) return 'ChromeOS'
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/mac os|macintosh/i.test(userAgent)) return 'macOS'
  if (/linux|x11/i.test(userAgent)) return 'Linux'
  return 'this device'
}

export function defaultAgentName(userAgent: string): string {
  return `Claude Code on ${deviceName(userAgent)}`
}

/** What "Copy for an AI agent" puts on the clipboard: enough for an agent to find the page. */
export function pageForAgent(page: { id: string; title: string; path?: string }): string {
  const file = page.path ? ` (${page.path})` : ''
  return `Wiki page “${page.title}”${file}, document id ${page.id}`
}

/**
 * Whether the backend has its MCP server: false on a 404, null when the probe failed (offline,
 * CORS in development). Any other answer means it is there. With the session cookie: without
 * credentials the backend answers 401 before it knows whether the path exists.
 */
export async function mcpAvailable(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean | null> {
  try {
    const response = await fetchFn(url, { credentials: 'include', cache: 'no-store' })
    return response.status !== 404
  } catch {
    return null
  }
}
