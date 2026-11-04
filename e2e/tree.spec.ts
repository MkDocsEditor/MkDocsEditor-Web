import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { createDocument, login, openEditor, testName, typeAt } from './helpers'

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
    await page.getByRole('button', { name: `Actions for ${entry}` }).click()
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

test('logs in, loads the tree and opens a page', async ({ page }) => {
  await login(page)
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
  const name = testName('Ordner', testInfo)
  await page.getByTestId('create-fab').click()
  await page.getByTestId('create-section').click()
  await page.getByTestId('name-input').locator('input').fill(name)
  await page.getByTestId('name-confirm').click()
  const main = page.locator('main')
  await expect(main.getByText(name, { exact: true })).toBeVisible()

  await menuAction(page, name, 'Rename', page.getByTestId('name-input'))
  await page.getByTestId('name-input').locator('input').fill(`${name} neu`)
  await page.getByTestId('name-confirm').click()
  await expect(main.getByText(`${name} neu`, { exact: true })).toBeVisible()

  await menuAction(page, `${name} neu`, 'Delete', page.getByTestId('confirm-button'))
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
  await page.getByTestId('search-input').locator('input').fill('kürbis')
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
