import { expect, test } from '@playwright/test'

import { backendRequest, createDocument, openEditor, testName, userPage } from './helpers'
import { USERS } from './ports'

test('the file browser follows changes and shows who edits a page', async ({
  browser,
}, testInfo) => {
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const main = alice.locator('main')
  await expect(main.getByText('Rezepte')).toBeVisible()

  // a page created elsewhere shows up without a reload
  const name = testName('Live', testInfo)
  const id = await createDocument(name)
  const row = main.locator('[data-testid="entry-document"]', { hasText: name })
  await expect(row).toBeVisible()

  // bob opens it: alice sees his avatar on the row
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(bob, id)
  await expect(row.getByTestId('online-avatars')).toHaveAttribute('title', /bob/i)

  // bob leaves, the avatar goes away
  await bob.context().close()
  await expect(row.getByTestId('online-avatars')).toHaveCount(0)

  // a rename elsewhere shows up too
  const renamed = `${name} neu`
  const response = await backendRequest('PUT', `/document/${id}/`, { name: renamed })
  expect(response.ok).toBe(true)
  await expect(main.getByText(renamed, { exact: true })).toBeVisible()
  await alice.context().close()
})
