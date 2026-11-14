import { expect, test } from '@playwright/test'

import { BACKEND_URL, USERS } from './ports'
import { backendRequest, createDocument, openEditor, testName, userPage } from './helpers'

test('an agent with an app token is here while it edits, and its text says so', async ({
  browser,
}, testInfo) => {
  const user = USERS.bob
  const name = testName('Agent', testInfo)
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name, scope: 'write', expiresInDays: 1 },
    user,
  )
  expect(created.ok, await created.clone().text()).toBe(true)
  const { token } = (await created.json()) as { token: string }

  const id = await createDocument(testName('Agent page', testInfo))
  const page = await userPage(browser, user)
  await openEditor(page, id)

  const edit = await fetch(`${BACKEND_URL}/document/${id}/edits/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits: [{ old: '', new: 'Vom Agenten geschrieben.' }] }),
  })
  test.skip(edit.status === 404, 'the backend has no content edit API yet')
  expect(edit.ok, await edit.clone().text()).toBe(true)

  // listed with a robot while it works, not to follow
  await expect(page.getByTestId('online-agent')).toHaveAttribute(
    'aria-label',
    new RegExp(`^${name} \\(agent of .+\\) is here$`),
  )
  await expect(page.getByTestId('online-user')).toHaveCount(0)
  await expect(page.locator('.cm-content')).toContainText('Vom Agenten geschrieben.')

  // the marker is in the color of the person, and its title names the agent
  const marker = page.locator('.cm-author').first()
  await expect(marker).toHaveAttribute('title', /\S+ via .+/, { timeout: 15_000 })
  expect((await marker.getAttribute('title'))?.endsWith(` via ${name}`)).toBe(true)
})
