import { expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

import { BACKEND_PORT, E2E_USER } from './ports'

type User = { username: string; password: string }

export async function login(page: Page, user: User = E2E_USER): Promise<void> {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Benutzername').fill(user.username)
  await page.getByLabel('Passwort', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByTestId('section-title')).toHaveText('Wiki')
}

/** A logged-in page in its own browser context (own storage, like another device). */
export async function userPage(browser: Browser, user: User, options = {}): Promise<Page> {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await login(page, user)
  return page
}

export async function backendRequest(
  method: string,
  path: string,
  body?: unknown,
  user: User = E2E_USER,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${BACKEND_PORT}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${user.username}:${user.password}`).toString('base64')}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Gespeichert')
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
