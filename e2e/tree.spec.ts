import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { createDocument, login, openEditor, openFiles, testName, typeAt } from './helpers'
import { E2E_USER } from './ports'

/** How many pages the local copy of the wiki holds. */
function storedPageCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('mkdocseditor-wiki')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const count = open.result.transaction('records').objectStore('records').count()
          count.onerror = () => reject(count.error)
          count.onsuccess = () => {
            open.result.close()
            resolve(count.result)
          }
        }
      }),
  )
}

/**
 * Opens the actions menu of an entry and picks an action. A live tree update (another test's
 * edit reaching the disk) can close the menu in between, so this retries until `opens` shows.
 *
 * It waits for the menu's opening animation first. Otherwise Playwright retries the click while
 * the item is "not stable" and scrolls the page on its fourth try. In a long list the menu then
 * repositions between mouse down and up, the click misses the item, and no dialog opens.
 */
async function menuAction(page: Page, entry: string, action: string, opens: Locator) {
  await expect(async () => {
    await page
      .locator('main')
      .getByRole('button', { name: `Actions for ${entry}` })
      .click()
    const item = page.locator('.v-overlay--active').getByText(action, { exact: true })
    await item.evaluate((element) => {
      const menu = element.closest('.v-overlay__content') ?? element
      return Promise.all(menu.getAnimations({ subtree: true }).map((a) => a.finished))
    })
    await item.click({ timeout: 2000 })
    await expect(opens).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('anna')
  await page.getByLabel('Password', { exact: true }).fill('falsch')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('login-error')).toContainText('Wrong username or password')
})

test('the login of the wiki returns to its page, and only on this host', async ({ page }) => {
  // the published wiki at /view/, which asks the app for the login
  await page.route('**/view/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1 id="wiki">Wiki: Haus</h1>' }),
  )
  await page.goto('/login?next=%2Fview%2FHaus%2F')
  await page.getByLabel('Username').fill(E2E_USER.username)
  await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // the welcome steps, if any, come first and then go on to the page
  const wiki = page.locator('#wiki')
  await expect(async () => {
    for (const id of ['passkey-step-later', 'android-hint-dismiss']) {
      const button = page.getByTestId(id)
      if (await button.isVisible()) await button.click({ timeout: 1000 })
    }
    await expect(wiki).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/view\/Haus\/$/)

  // signed in already: straight on
  await page.goto('/login?next=%2Fview%2FKueche%2F')
  await expect(page).toHaveURL(/\/view\/Kueche\/$/)

  // another host is not followed: home instead
  await page.goto('/login?next=%2F%2Fexample.com%2F')
  await expect(page.getByTestId('dashboard-title')).toBeVisible()
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host)
})

test('logs in, loads the tree and opens a page', async ({ page }) => {
  await login(page)
  await openFiles(page)
  const main = page.locator('main')
  await expect(main.getByText('Rezepte')).toBeVisible()
  await expect(main.getByText('Urlaub')).toBeVisible()

  await main.getByText('Rezepte').click()
  await expect(page.getByTestId('section-title')).toHaveText('Rezepte')
  await main.getByText('Kuchen').click()
  await main.getByText('Apfelkuchen').click()
  await expect(page.getByTestId('document-title')).toHaveText('Apfelkuchen')
  await expect(page.getByTestId('markdown-preview')).toContainText('Äpfel schälen')

  // a reload keeps the session and the route
  await page.reload()
  await expect(page.getByTestId('document-title')).toHaveText('Apfelkuchen')
})

test('creates, renames and deletes a folder', async ({ page }, testInfo) => {
  await login(page)
  await openFiles(page)
  const name = testName('Ordner', testInfo)
  await page.getByTestId('create-fab').click()
  await page.getByTestId('create-section').click()
  await page.getByTestId('name-input').locator('input').fill(name)
  await page.getByTestId('name-confirm').click()
  const main = page.locator('main')
  await expect(main.getByText(name, { exact: true })).toBeVisible()

  // renaming goes through the move dialog, without its folder picker
  const dialog = page.getByTestId('move-dialog')
  await menuAction(page, name, 'Rename…', dialog)
  await expect(dialog.getByPlaceholder('Search folders…')).toHaveCount(0)
  await dialog.getByTestId('move-name').locator('input').fill(`${name} neu`)
  await expect(dialog.getByTestId('move-new-path')).toHaveText(`${name} neu`)
  await dialog.getByTestId('move-apply').click()
  await expect(dialog).toBeHidden()
  await expect(main.getByText(`${name} neu`, { exact: true })).toBeVisible()

  await menuAction(page, `${name} neu`, 'Delete…', page.getByTestId('confirm-button'))
  await page.getByTestId('confirm-button').click()
  await expect(main.getByText(`${name} neu`, { exact: true })).toHaveCount(0)
})

test('search finds the text of pages, also after a reload without the server', async ({
  page,
  context,
}, testInfo) => {
  const word = testName('Suchwort', testInfo).replace(/\W/g, '')
  const id = await createDocument(testName('Seite mit Treffer', testInfo))
  await login(page)
  await openEditor(page, id)
  await typeAt(page, 'end', `Hier steht ${word} im Text`)
  await page.getByTestId('search-button').click()
  const input = page.getByTestId('search-input').locator('input')
  await input.fill(word)
  const excerpt = page.getByTestId('search-excerpt').first()
  await expect(excerpt.locator('mark')).toHaveText(word)
  await expect(page.getByTestId('search-match-count').first()).toHaveText('1 match')

  // chosen once, the term comes back as a recent search
  await input.press('Enter')
  await page.getByTestId('search-button').click()
  await expect(page.getByTestId('search-recent-term').first()).toHaveText(word)
  await page.keyboard.press('Escape')

  // the copy in IndexedDB survives a reload without the server
  await expect.poll(() => storedPageCount(page)).toBeGreaterThan(0)
  await context.route('**/section/**', (route) => route.abort())
  await context.route('**/document/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByTestId('sync-status')).toContainText('Not connected · Synced')
  await page.getByTestId('search-button').click()
  await page.getByTestId('search-input').locator('input').fill(word)
  await expect(page.getByTestId('search-excerpt').first().locator('mark')).toHaveText(word)
})

test('finds pages with the search', async ({ page }) => {
  await login(page)
  await page.getByTestId('search-button').click()
  await page.getByTestId('search-input').locator('input').fill('kurbis')
  await page.getByTestId('search-result').first().click()
  await expect(page.getByTestId('document-title')).toHaveText('Kürbissuppe')
})

test('renders the preview like the wiki, with images and links', async ({ page }) => {
  await login(page)
  await page.getByTestId('search-button').click()
  await page.getByTestId('search-input').locator('input').fill('apfelkuchen')
  await page.keyboard.press('Enter')
  const preview = page.getByTestId('markdown-preview')
  await expect(preview.locator('.admonition.tip .admonition-title')).toHaveText('Tipp')
  await expect(preview.locator('input[type=checkbox]')).toHaveCount(2)
  // the image is a resource that needs auth: it is loaded as a blob
  const image = preview.locator('img[alt="Foto"]')
  await expect(image).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  // links to other pages stay in the app
  await preview.getByRole('link', { name: 'Kürbissuppe' }).click()
  await expect(page.getByTestId('document-title')).toHaveText('Kürbissuppe')
})
