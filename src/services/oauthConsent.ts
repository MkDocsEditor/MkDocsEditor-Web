/**
 * Where the answer to an OAuth request goes, for the consent screen: the host of a web address,
 * or the scheme of an app (`cursor://…`). `local`: an app on this computer (its own listener).
 */
export function describeOAuthTarget(redirectUri: string): { label: string; local: boolean } {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return { label: redirectUri, local: false }
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const local = host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host)
    return { label: url.host, local }
  }
  // an app's own scheme opens that app on this device
  return { label: `${url.protocol}//${url.host}`.replace(/\/\/$/, ''), local: true }
}
