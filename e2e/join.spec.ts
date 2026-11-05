import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { accountMenu, ADMIN, devicePage, uniqueUsername } from './accounts'
import { createDocument, login, openEditor, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

/** Older backends lack this; the backend clone of CI follows its master branch. */
async function requireFeature(feature: string): Promise<void> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes(feature), `the backend has no ${feature}`)
}

const LINES = Array.from({ length: 200 }, (_, i) => `Zeile ${i + 1}`).join('\n')

/** A page with long text and the sender in it, with the caret on line 150. */
async function senderOn(page: Page, id: string): Promise<void> {
  await openEditor(page, id)
  await page.locator('.cm-content').click()
  await page.keyboard.insertText(LINES)
  await page.keyboard.press('ControlOrMeta+Home')
  for (let i = 0; i < 149; i++) await page.keyboard.press('ArrowDown')
  await expect(page.locator('.cm-activeLine')).toContainText('Zeile 150')
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
}

test.describe('join links', () => {
  test('lead into the editor at the position of the sender', async ({ browser }, testInfo) => {
    await requireFeature('join-presence')
    const id = await createDocument(`Join ${testInfo.project.name} ${testInfo.retry}`)
    const sender = await userPage(browser, USERS.alice)
    await senderOn(sender, id)

    let link: string
    if (testInfo.project.name === 'desktop') {
      await sender.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      await sender.getByTestId('share-document').click()
      link = await sender.evaluate(() => navigator.clipboard.readText())
      // the share button leaves the focus in the editor, so the sender stays findable
      await expect(sender.locator('.cm-content')).toBeFocused()
    } else {
      link = `/join/${id}?from=${await sender.evaluate(() => JSON.parse(localStorage.getItem('mkdocseditor.user')!).id)}`
    }
    expect(link).toContain(`/join/${id}?from=`)

    // preview is the stored default of the reader of the link
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.addInitScript(() =>
      localStorage.setItem('mkdocseditor.documentMode', JSON.stringify('preview')),
    )
    await login(page, USERS.bob)
    await page.goto(link)
    await expect(page.locator('.cm-activeLine')).toContainText('Zeile 150', { timeout: 15_000 })
    await expect(page.locator('.cm-activeLine')).toBeInViewport()
    await expect(page.locator('.cm-content')).toBeFocused()
    expect(new URL(page.url()).search).toBe('')
    const stored = await page.evaluate(() => localStorage.getItem('mkdocseditor.documentMode'))
    expect(stored).toBe(JSON.stringify('preview'))

    // readers follow too, in a read-only editor
    const reader = await userPage(browser, USERS.carol)
    await reader.goto(link)
    await expect(reader.locator('.cm-activeLine')).toContainText('Zeile 150', { timeout: 15_000 })
    await expect(reader.locator('.cm-content')).toHaveAttribute('contenteditable', 'false')
  })

  test('find the last position of a sender who has left', async ({ browser }, testInfo) => {
    await requireFeature('join-presence')
    const id = await createDocument(`Join left ${testInfo.project.name} ${testInfo.retry}`)
    const sender = await userPage(browser, USERS.alice)
    await senderOn(sender, id)
    const from = await sender.evaluate(
      () => JSON.parse(localStorage.getItem('mkdocseditor.user')!).id as string,
    )
    await sender.context().close()

    const page = await userPage(browser, USERS.bob)
    await expect(async () => {
      await page.goto(`/join/${id}?from=${from}`)
      await expect(page.locator('.cm-activeLine')).toContainText('Zeile 150', { timeout: 3000 })
    }).toPass({ timeout: 30_000 })
  })

  test('say so when the sender is not there', async ({ browser }, testInfo) => {
    await requireFeature('join-presence')
    const id = await createDocument(`Join gone ${testInfo.project.name} ${testInfo.retry}`)
    const page = await userPage(browser, USERS.bob)
    await page.goto(`/join/${id}?from=somebody-else`)
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText('Could not find the position of the person who invited you.'),
    ).toBeVisible({
      timeout: 10_000,
    })
  })

  test('come back after the sign-in', async ({ browser }, testInfo) => {
    const id = await createDocument(`Join login ${testInfo.project.name} ${testInfo.retry}`)
    const page = await devicePage(browser, testInfo)
    await page.goto(`/join/${id}?from=somebody`)
    await page.getByTestId('join-sign-in').click()
    await page.getByLabel('Username').fill(USERS.bob.username)
    await page.getByLabel('Password', { exact: true }).fill(USERS.bob.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const later = page.getByTestId('passkey-step-later')
    const notNow = page.getByTestId('android-hint-dismiss')
    await expect(async () => {
      if (await later.isVisible()) await later.click()
      if (await notNow.isVisible()) await notNow.click()
      await expect(page).toHaveURL(new RegExp(`/document/${id}`), { timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    await expect(page.locator('.cm-content')).toBeVisible()
  })

  test('let someone without an account ask, and continue after the approval', async ({
    browser,
  }, testInfo) => {
    await requireFeature('access-requests')
    const id = await createDocument(`Join ask ${testInfo.project.name} ${testInfo.retry}`)
    const name = `Anna <b>${testInfo.project.name}</b>`
    const guest = await devicePage(browser, testInfo)
    await guest.goto(`/join/${id}?from=somebody`)
    await guest.getByTestId('join-request').click()
    // the focus arrives late, and would take a fill of the message into the name
    const nameInput = guest.getByTestId('join-name').locator('input')
    await expect(nameInput).toBeFocused()
    await nameInput.fill(name)
    await guest.getByTestId('join-message').locator('textarea').fill('Markus sent me')
    await guest.getByTestId('join-submit').click()
    await expect(guest.getByTestId('join-waiting')).toBeVisible()
    expect(guest.url()).not.toContain('mda_')

    const admin = await devicePage(browser, testInfo, ADMIN)
    await expect(admin.getByTestId('access-requests-badge')).toBeVisible()
    await accountMenu(admin, 'menu-admin')
    const item = admin.getByTestId('access-request-item').filter({ hasText: name })
    await expect(item.getByTestId('access-request-name')).toHaveText(name)
    await expect(item).toContainText('Markus sent me')
    await item.getByTestId('access-request-approve').click()
    await admin.getByTestId('access-request-confirm').click()
    await expect(admin.getByTestId('link-result')).toBeVisible()

    // coming back to the tab asks at once, instead of at the next round
    await expect(async () => {
      await guest.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(guest.getByTestId('link-form')).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 40_000 })
    expect(guest.url()).not.toContain('mdl_')

    const form = guest.getByTestId('link-form')
    await form.getByLabel('Username').fill(uniqueUsername('anna', testInfo))
    await form.getByLabel('New password', { exact: true }).fill('a guest with a hat 7')
    await form.getByLabel('Repeat the password').fill('a guest with a hat 7')
    await guest.getByRole('button', { name: 'Create account' }).click()
    await guest.getByTestId('done-continue').click()
    await expect(guest).toHaveURL(new RegExp(`/document/${id}`))
    await expect(guest.locator('.cm-content')).toBeVisible()
    const left = await guest.evaluate(() => localStorage.getItem('mkdocseditor.accessRequest'))
    expect(left).toBeNull()
  })
})
