import { expect } from '@playwright/test'
import type { Browser, Page, TestInfo } from '@playwright/test'

import { BACKEND_URL, E2E_USER } from './ports'

export type User = { username: string; password: string }

export async function login(page: Page, user: User = E2E_USER): Promise<void> {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  const username = page.getByLabel('Username')
  const password = page.getByLabel('Password', { exact: true })
  // The username field focuses itself after mounting. On a slow machine that can happen during
  // a fill and send the text to the wrong field, so check both values and fill again if needed.
  await expect(async () => {
    await username.fill(user.username)
    await password.fill(user.password)
    await expect(username).toHaveValue(user.username, { timeout: 500 })
    await expect(password).toHaveValue(user.password, { timeout: 500 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await skipPasskeyStep(page)
}

/**
 * After a password login, the welcome page may come first: the passkey step for accounts
 * without one, and on phones the Android app hint. Tests that are not about them skip both.
 */
export async function skipPasskeyStep(page: Page): Promise<void> {
  const title = page.getByTestId('section-title')
  const later = page.getByTestId('passkey-step-later')
  const notNow = page.getByTestId('android-hint-dismiss')
  await expect(async () => {
    if (await later.isVisible()) await later.click()
    if (await notNow.isVisible()) await notNow.click()
    await expect(title).toHaveText('Wiki', { timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

/** A logged-in page in its own browser context (own storage, like another device). */
export async function userPage(browser: Browser, user: User, options = {}): Promise<Page> {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await login(page, user)
  return page
}

const bearerTokens = new Map<string, string>()

/** A bearer session for REST calls from the tests, like a native client gets. */
export async function bearerToken(user: User, baseUrl = BACKEND_URL): Promise<string> {
  const key = `${baseUrl} ${user.username}`
  const cached = bearerTokens.get(key)
  if (cached) return cached
  const response = await fetch(`${baseUrl}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({
      username: user.username,
      password: user.password,
      sessionType: 'bearer',
      deviceName: 'e2e',
    }),
  })
  const body = (await response.json()) as { token?: string; status?: string }
  if (!response.ok || !body.token)
    throw new Error(`bearer login of ${user.username} failed: ${JSON.stringify(body)}`)
  bearerTokens.set(key, body.token)
  return body.token
}

/** Forgets a cached bearer session (after its sessions were revoked). */
export function forgetBearer(user: User, baseUrl = BACKEND_URL): void {
  bearerTokens.delete(`${baseUrl} ${user.username}`)
}

export async function backendRequest(
  method: string,
  path: string,
  body?: unknown,
  user: User = E2E_USER,
  baseUrl = BACKEND_URL,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await bearerToken(user, baseUrl)}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/**
 * A name that is unique per browser project and attempt, so a retry does not collide with what
 * the failed attempt left in the shared test wiki.
 */
export function testName(base: string, testInfo: TestInfo): string {
  const repeat = testInfo.repeatEachIndex > 0 ? ` r${testInfo.repeatEachIndex}` : ''
  return `${base} ${testInfo.project.name}${repeat}${testInfo.retry > 0 ? ` ${testInfo.retry}` : ''}`
}

/** Creates a page in the root folder over REST and returns its id. */
export async function createDocument(name: string): Promise<string> {
  const tree = (await (await backendRequest('GET', '/section/')).json()) as { id: string }
  const response = await backendRequest('POST', '/document/', { parent: tree.id, name })
  expect(response.ok).toBe(true)
  const doc = (await response.json()) as { id: string }
  return doc.id
}

export async function documentContent(id: string): Promise<string> {
  return (await backendRequest('GET', `/document/${id}/content/`)).text()
}

/** Opens a document in edit mode and waits until the editor is connected. */
export async function openEditor(page: Page, id: string): Promise<void> {
  await page.goto(`/document/${id}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
}

export function editorText(page: Page): Promise<string> {
  return page.locator('.cm-content').evaluate((el) =>
    [...el.querySelectorAll('.cm-line')]
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement
        // remote carets carry the user name as text
        for (const caret of copy.querySelectorAll('.cm-remote-caret')) caret.remove()
        return copy.textContent ?? ''
      })
      .join('\n'),
  )
}

/** Types at the end (or start) of the document. */
export async function typeAt(page: Page, where: 'start' | 'end', text: string): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press(where === 'end' ? 'ControlOrMeta+End' : 'ControlOrMeta+Home')
  await page.keyboard.type(text)
}

/** Uploads a file into a folder over REST. */
export async function uploadResource(
  sectionId: string,
  name: string,
  body: BlobPart,
  type = 'application/octet-stream',
): Promise<{ id: string; name: string }> {
  const form = new FormData()
  form.append('file', new Blob([body], { type }), name)
  const response = await fetch(
    `${BACKEND_URL}/resource/${sectionId}/${encodeURIComponent(name)}/`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${await bearerToken(E2E_USER)}` },
      body: form,
    },
  )
  expect(response.ok).toBe(true)
  return (await response.json()) as { id: string; name: string }
}
