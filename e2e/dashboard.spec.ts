import { expect, test } from '@playwright/test'

import { settingsSection } from './accounts'
import { createDocument, login, openEditor, testName, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

async function features(): Promise<string[]> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  return info.features ?? []
}

test('starts with the start page of the wiki, or with the files', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('dashboard-index')).toContainText('Das ist das Test-Wiki.')
  // the title of the start page shows when it is opened, not here
  await expect(page.getByTestId('dashboard-index').getByText('Willkommen')).toBeHidden()

  await page.getByTestId('all-files').click()
  await expect(page.getByTestId('section-title')).toHaveText('Wiki')

  // the setting of this browser, under Settings > Appearance: `/` shows the files instead
  await page.getByTestId('account-menu').click()
  await page.getByTestId('menu-settings').click()
  await settingsSection(page, 'appearance')
  await page.getByTestId('setting-start-page').getByLabel('Files of the top folder').check()
  await page.goto('/')
  await expect(page.getByTestId('section-title')).toHaveText('Wiki')
  await page.goto('/settings/appearance')
  await page.getByTestId('setting-start-page').getByLabel('What’s going on').check()
  await page.goto('/')
  await expect(page.getByTestId('dashboard-title')).toBeVisible()
})

test('pins pages for oneself and for everyone', async ({ browser }, testInfo) => {
  test.skip(!(await features()).includes('pins'), 'the backend has no pins')
  const name = testName('Angepinnt', testInfo)
  const id = await createDocument(name)

  // an editor pins it for everyone, a reader only for themselves
  const bob = await userPage(browser, USERS.bob)
  await bob.goto(`/document/${id}`)
  await bob.getByRole('button', { name: 'More' }).click()
  await bob.getByTestId('item-pin-family').click()
  await bob.goto('/')
  await expect(bob.getByTestId('pins-family').getByText(name)).toBeVisible()
  await expect(bob.getByTestId('pins-family')).toContainText('pinned by')

  const carol = await userPage(browser, USERS.carol)
  await expect(carol.getByTestId('pins-family').getByText(name)).toBeVisible()
  await carol.goto(`/document/${id}`)
  await carol.getByRole('button', { name: 'More' }).click()
  await expect(carol.getByTestId('item-pin-family')).toHaveCount(0)
  await carol.getByTestId('item-pin-personal').click()
  await carol.goto('/')
  await expect(carol.getByTestId('pins-personal').getByText(name)).toBeVisible()
  // nobody else sees it
  await expect(bob.getByTestId('pins-personal').getByText(name)).toHaveCount(0)

  // unpinned for everyone: the others see it go without a reload
  await bob
    .getByTestId('pins-family')
    .getByRole('button', { name: `Unpin ${name}` })
    .click()
  await expect(carol.getByTestId('pins-family').getByText(name)).toHaveCount(0)
  await expect(carol.getByTestId('pins-personal').getByText(name)).toBeVisible()
})

test('the feed says who changed which page', async ({ browser }, testInfo) => {
  test.skip(!(await features()).includes('feed'), 'the backend has no feed')
  const name = testName('Neuigkeit', testInfo)
  const id = await createDocument(name)
  const alice = await userPage(browser, USERS.alice)
  await openEditor(alice, id)
  await alice.locator('.cm-content').click()
  await alice.keyboard.insertText('# Zutaten\n\nMehl und Zucker\n')
  await expect(alice.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

  const bob = await userPage(browser, USERS.bob)
  const entry = bob.getByTestId('feed-entry').filter({ hasText: name }).first()
  await expect(async () => {
    await bob.reload()
    await expect(entry).toContainText('edited', { timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await expect(entry).toContainText('Zutaten')
  await entry.click()
  await expect(bob).toHaveURL(new RegExp(`/document/${id}$`))
})
