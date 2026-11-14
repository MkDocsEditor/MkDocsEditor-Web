import { createHash, randomBytes } from 'node:crypto'

import { expect, test } from '@playwright/test'

import { confirmIfAsked, requireEndpoints } from './accounts'
import { BACKEND_URL, BROWSER_BACKEND_URL, USERS } from './ports'
import { testName } from './helpers'

/** The local listener of a CLI like Claude Code; the test catches the redirect to it. */
const CALLBACK = 'http://127.0.0.1:9/callback'

test('an MCP client connects with OAuth: sign in, allow, and revoke it in the settings', async ({
  browser,
}, testInfo) => {
  await requireEndpoints('/server-info/')
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('oauth'), 'the backend has no OAuth yet')
  const user = USERS.bob
  const clientName = testName('OAuth client', testInfo)

  // what the client does before the browser: register, then make a PKCE challenge
  const registered = await fetch(`${BACKEND_URL}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ redirect_uris: [CALLBACK], client_name: clientName }),
  })
  expect(registered.status, await registered.clone().text()).toBe(201)
  const { client_id: clientId } = (await registered.json()) as { client_id: string }
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = new URL(`${BROWSER_BACKEND_URL}/oauth/authorize`)
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'write',
  }))
    authorize.searchParams.set(key, value)

  // the browser is not signed in yet: the consent screen comes after the login
  const page = await (await browser.newContext()).newPage()
  let callback = ''
  await page.route(`${CALLBACK}**`, async (route) => {
    callback = route.request().url()
    await route.fulfill({ contentType: 'text/html', body: '<p>callback-ok</p>' })
  })
  await page.goto(authorize.href)
  await expect(page).toHaveURL(/\/login\?/)
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const client = page.getByTestId('oauth-client')
  // the welcome steps (passkey, on phones the Android app) come first and lead back here
  const later = page.getByTestId('passkey-step-later')
  const notNow = page.getByTestId('android-hint-dismiss')
  await expect(async () => {
    if (await later.isVisible()) await later.click()
    if (await notNow.isVisible()) await notNow.click()
    await expect(client).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await expect(client).toContainText(`calls itself ${clientName}`)
  await expect(page.getByTestId('oauth-target-host')).toHaveText('127.0.0.1:9')

  await page.getByTestId('oauth-approve').click()
  await confirmIfAsked(page, page.getByText('callback-ok'), user.password)
  const answer = new URL(callback)
  expect(answer.searchParams.get('state')).toBe('xyz')
  const code = answer.searchParams.get('code')
  expect(code).toBeTruthy()

  // the client trades the code for a token, which works for MCP
  const tokenResponse = await fetch(`${BACKEND_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: CALLBACK,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  expect(tokenResponse.ok, await tokenResponse.clone().text()).toBe(true)
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string }
  const mcp = () =>
    fetch(`${BACKEND_URL}/mcp`, { headers: { Authorization: `Bearer ${accessToken}` } })
  expect((await mcp()).status).not.toBe(401)

  // the grant is in the token list, and revoking it disconnects the client
  await page.goto('/settings/agents')
  const grant = page.getByTestId('app-token').filter({ hasText: clientName })
  await expect(grant.getByTestId('oauth-badge')).toBeVisible()
  await grant.getByRole('button', { name: `Revoke ${clientName}` }).click()
  await page.getByTestId('confirm-button').click()
  await expect(grant).toHaveCount(0)
  expect((await mcp()).status).toBe(401)
})
